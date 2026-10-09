import {
  DeliveryNotFound,
  InvalidUpload,
  isSinglePut,
  NotUploaded,
  partCount,
  RateLimited,
  rateLimits,
  StorageUnavailable,
  UploadClosed,
} from "@tranzfer/contracts";
import type {
  Delivery,
  DeliveryId,
  RequestId,
  SignedUrl,
  TransferId,
  UploadRequest,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";

import { Deliveries, UPLOAD_WINDOW } from "./deliveries";
import { Plans } from "./plans";
import { Storage } from "./storage";
import type { StoredObject } from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;
// A finalizing transfer older than this lost its browser; the sweeper finishes it.
const RECOVER_AFTER = Duration.minutes(2);
// Transfers created within R2's 7-day window for incomplete multipart uploads.
const RECOVER_WITHIN = Duration.days(7);
const RECOVER_BATCH = 50;

type Transfer = typeof schema.transfer.$inferSelect;

// The stored object must be exactly what the sender declared.
const verify = (transfer: Transfer, object: Option.Option<StoredObject>) =>
  Match.value(object).pipe(
    Match.when(Option.isNone, () => Effect.fail(new NotUploaded())),
    Match.when(
      (found) => Option.isSome(found) && found.value.size !== transfer.size,
      (found) =>
        Effect.logError("uploaded size does not match", {
          expected: transfer.size,
          found: Option.map(found, ({ size }) => size),
          transferId: transfer.id,
        }).pipe(Effect.andThen(Effect.fail(new InvalidUpload()))),
    ),
    Match.orElse((found) => Effect.succeed(found.value)),
  );

/**
 * Counts signing requests per sender. Cloudflare's rate-limit binding in the
 * Worker, set to `rateLimits.uploadSigning`; it answers whether this request
 * still fits.
 */
export class SigningRate extends Context.Service<
  SigningRate,
  { readonly allow: (senderId: string) => Effect.Effect<boolean> }
>()("tranzfer/SigningRate") {}

/** Upload signing and completion for a sender's transfers. */
export class Transfers extends Context.Service<
  Transfers,
  {
    /**
     * With `requestId`, only transfers of deliveries that came in through that
     * file request sign, and the owner's own signing rate is not spent.
     */
    readonly sign: (
      senderId: string,
      key: string,
      request: UploadRequest,
      requestId?: RequestId,
    ) => Effect.Effect<SignedUrl, DeliveryNotFound | InvalidUpload | RateLimited | UploadClosed>;
    readonly finalize: (
      senderId: string,
      transferId: TransferId,
      requestId?: RequestId,
    ) => Effect.Effect<
      Delivery,
      DeliveryNotFound | InvalidUpload | NotUploaded | StorageUnavailable | UploadClosed
    >;
    /** Finishes transfers whose browser left after the bytes landed. Returns how many. */
    readonly recoverFinalizing: Effect.Effect<number>;
  }
>()("tranzfer/Transfers") {
  static readonly layer = Layer.effect(
    Transfers,
    Effect.gen(function* makeTransfers() {
      const { db } = yield* Database;
      const deliveries = yield* Deliveries;
      const plans = yield* Plans;
      const signingRate = yield* SigningRate;
      const storage = yield* Storage;

      const owned = (
        senderId: string,
        where: { id: TransferId } | { objectKey: string },
        requestId?: RequestId,
      ) =>
        db.query.transfer.findFirst({
          where: {
            ...where,
            delivery: requestId === undefined ? { senderId } : { requestId, senderId },
          },
          with: { delivery: true },
        });

      /**
       * Claims the transfer as complete. The claim is conditional, so concurrent
       * finalizes and the sweeper converge, and a cancel stays final. Returns
       * whether this call made the claim; `markReady` flips the delivery.
       */
      const complete = Effect.fn("Transfers.complete")(function* complete(
        transfer: Transfer,
        object: StoredObject,
      ) {
        yield* Effect.annotateCurrentSpan({
          "transfer.id": transfer.id,
          "transfer.size": object.size,
        });
        const now = yield* Clock.currentTimeMillis;
        const claimed = yield* db
          .update(schema.transfer)
          .set({ completedAt: new Date(now), etag: object.etag, state: "complete" })
          .where(
            and(
              eq(schema.transfer.id, transfer.id),
              inArray(schema.transfer.state, ["uploading", "finalizing"]),
            ),
          )
          .returning({ id: schema.transfer.id });
        if (claimed.length === 0) {
          const current = yield* db.query.transfer.findFirst({
            columns: { state: true },
            where: { id: transfer.id },
          });
          if (current?.state === "cancelled") {
            return yield* new UploadClosed();
          }
        }
        yield* Effect.annotateCurrentSpan("transfer.claimed", claimed.length > 0);
        return claimed.length > 0;
      });

      /**
       * Trusts the object only after closing its key. Nothing is sealed until
       * an object exists, so a paused or still-running upload is never aborted.
       * Then `finalizing` stops new uploads, aborting every open multipart
       * upload kills URLs signed earlier, parts included, and the second HEAD
       * reads the object that can no longer change.
       */
      const settle = Effect.fn("Transfers.settle")(function* settle(transfer: Transfer) {
        yield* Effect.annotateCurrentSpan({
          "delivery.id": transfer.deliveryId,
          "transfer.id": transfer.id,
          "transfer.size": transfer.size,
        });
        yield* verify(transfer, yield* storage.head(transfer.objectKey));
        yield* db
          .update(schema.transfer)
          .set({ state: "finalizing" })
          .where(and(eq(schema.transfer.id, transfer.id), eq(schema.transfer.state, "uploading")));
        yield* storage.seal(transfer.objectKey);
        const sealed = yield* verify(transfer, yield* storage.head(transfer.objectKey));
        return yield* complete(transfer, sealed);
      });

      /**
       * Flips open deliveries whose every transfer is complete to ready, with
       * expiry counted from now. One conditional statement, so it is safe to run
       * after every finalize and on every sweep: that is what recovers a
       * delivery whose finalize died between the two writes.
       */
      const markReady = (deliveryId?: DeliveryId) =>
        Effect.flatMap(Clock.currentTimeMillis, (now) =>
          db
            .update(schema.delivery)
            .set({
              expiresAt: sql`${now} + ${schema.delivery.retentionDays} * ${DAY_MS}`,
              status: "ready",
            })
            .where(
              and(
                deliveryId === undefined ? undefined : eq(schema.delivery.id, deliveryId),
                eq(schema.delivery.status, "open"),
                sql`EXISTS (SELECT 1 FROM transfer WHERE transfer.delivery_id = ${schema.delivery.id})`,
                sql`NOT EXISTS (SELECT 1 FROM transfer WHERE transfer.delivery_id = ${schema.delivery.id} AND transfer.state != 'complete')`,
              ),
            ),
        );

      return Transfers.of({
        finalize: Effect.fn("Transfers.finalize")(function* finalize(
          senderId: string,
          transferId: TransferId,
          requestId?: RequestId,
        ) {
          yield* Effect.annotateCurrentSpan("transfer.id", transferId);
          const transfer = yield* owned(senderId, { id: transferId }, requestId);
          if (transfer === undefined) {
            return yield* new DeliveryNotFound();
          }
          yield* Effect.annotateCurrentSpan({
            "delivery.id": transfer.deliveryId,
            "transfer.size": transfer.size,
            "transfer.state": transfer.state,
          });
          if (transfer.state === "cancelled") {
            return yield* new UploadClosed();
          }
          if (transfer.state !== "complete") {
            yield* settle(transfer).pipe(
              Effect.catchTag("StorageError", (error) =>
                Effect.logError("finalize storage failed", error.cause).pipe(
                  Effect.andThen(Effect.fail(new StorageUnavailable())),
                ),
              ),
            );
          }
          yield* markReady(transfer.deliveryId);
          return yield* deliveries.view(transfer.deliveryId);
        }, dieOnDatabaseError),

        recoverFinalizing: Effect.gen(function* recoverFinalizing() {
          const now = yield* Clock.currentTimeMillis;
          // Oldest-checked first; a miss touches updatedAt, so rows that keep
          // missing rotate to the back instead of filling every batch.
          const stuck = yield* db.query.transfer.findMany({
            limit: RECOVER_BATCH,
            orderBy: { updatedAt: "asc" },
            where: {
              createdAt: { gte: new Date(now - Duration.toMillis(RECOVER_WITHIN)) },
              state: "finalizing",
              updatedAt: { lte: new Date(now - Duration.toMillis(RECOVER_AFTER)) },
            },
          });
          const touch = (transfer: Transfer) =>
            db
              .update(schema.transfer)
              .set({ updatedAt: new Date(now) })
              .where(eq(schema.transfer.id, transfer.id))
              .pipe(Effect.as(0));
          const recovered = yield* Effect.forEach(
            stuck,
            (transfer) =>
              settle(transfer).pipe(
                Effect.as(1),
                // Not there yet, the wrong size, cancelled meanwhile, or a storage
                // blip: check it again later; the lifecycle rule is the backstop.
                Effect.catchTags({
                  InvalidUpload: () => touch(transfer),
                  NotUploaded: () => touch(transfer),
                  StorageError: (error) =>
                    Effect.logError("recover storage failed", error.cause).pipe(
                      Effect.andThen(touch(transfer)),
                    ),
                  UploadClosed: () => Effect.succeed(0),
                }),
              ),
            { concurrency: 8 },
          );
          yield* markReady();
          const total = recovered.reduce((sum, count) => sum + count, 0);
          yield* Effect.annotateCurrentSpan({
            "sweep.recovered": total,
            "sweep.stuck": stuck.length,
          });
          return total;
        }).pipe(Effect.withSpan("Transfers.recoverFinalizing"), dieOnDatabaseError),

        sign: Effect.fn("Transfers.sign")(function* sign(
          senderId: string,
          key: string,
          request: UploadRequest,
          requestId?: RequestId,
        ) {
          // Every sender is counted, but only Free is held to it, so the plan
          // is read only once the count runs over. An uploader through a file
          // request is held to the portal limits instead (FileRequests).
          if (
            requestId === undefined &&
            !(yield* signingRate.allow(senderId)) &&
            (yield* plans.current(senderId)).plan === "free"
          ) {
            return yield* new RateLimited({
              limit: "uploadSigning",
              retryAfterSeconds: rateLimits.uploadSigning.windowSeconds,
            });
          }
          const transfer = yield* owned(senderId, { objectKey: key }, requestId);
          if (transfer === undefined) {
            return yield* new DeliveryNotFound();
          }
          yield* Effect.annotateCurrentSpan({
            "delivery.id": transfer.deliveryId,
            "transfer.id": transfer.id,
            "transfer.part_count": partCount(transfer.size),
            "transfer.size": transfer.size,
            "transfer.state": transfer.state,
            "upload.request": request._tag,
          });
          if (request._tag === "Part") {
            yield* Effect.annotateCurrentSpan("upload.part_number", request.partNumber);
          }
          if (transfer.delivery.status !== "open") {
            return yield* new UploadClosed();
          }
          // The sweeper ends deliveries past the window, so stop signing at the
          // same point instead of letting an upload run into that cancel.
          const now = yield* Clock.currentTimeMillis;
          if (now - transfer.delivery.createdAt.getTime() > Duration.toMillis(UPLOAD_WINDOW)) {
            return yield* new UploadClosed();
          }
          if (transfer.state !== "uploading" && transfer.state !== "finalizing") {
            return yield* new UploadClosed();
          }
          // A file of one part or less may be one guarded PUT; any non-empty
          // file may be multipart, since transfers created before single PUTs
          // can still resume theirs.
          const multipart = transfer.size > 0;
          const invalid = Effect.fail(new InvalidUpload());
          // From here the object may land without the browser living to say
          // so; `finalizing` is what the sweeper looks for.
          const markFinalizing = db
            .update(schema.transfer)
            .set({ state: "finalizing" })
            .where(and(eq(schema.transfer.id, transfer.id), eq(schema.transfer.state, "uploading")))
            .pipe(Effect.asVoid);
          // Finalizing still signs parts on the existing upload id: a lost
          // Complete can hide missing parts, and NotUploaded sends transport
          // back to fill them. Create stays closed, since no new upload id may
          // start once Complete was signed. Safe because a completed or
          // aborted upload id rejects new parts, and finalize's seal aborts
          // every other open upload before recording the object. The
          // empty-file Put is safe to sign again: If-None-Match makes a second
          // write fail, and a lost response must not strand the transfer.
          yield* Match.valueTags(request, {
            Complete: () => (multipart ? markFinalizing : invalid),
            Create: () => {
              if (transfer.state === "finalizing") {
                return Effect.fail(new UploadClosed());
              }
              return multipart ? Effect.void : invalid;
            },
            List: () => (multipart ? Effect.void : invalid),
            Part: ({ partNumber }) =>
              multipart && partNumber <= partCount(transfer.size) ? Effect.void : invalid,
            Put: () => (isSinglePut(transfer.size) ? markFinalizing : invalid),
          });
          return yield* storage.signUpload(key, request);
        }, dieOnDatabaseError),
      });
    }),
  );
}

import {
  DeliveryNotFound,
  InvalidUpload,
  NotUploaded,
  partCount,
  StorageUnavailable,
  UploadClosed,
} from "@tranzfer/contracts";
import type {
  Delivery,
  DeliveryId,
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

import { Deliveries } from "./deliveries";
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

/** Upload signing and completion for a sender's transfers. */
export class Transfers extends Context.Service<
  Transfers,
  {
    readonly sign: (
      senderId: string,
      key: string,
      request: UploadRequest,
    ) => Effect.Effect<SignedUrl, DeliveryNotFound | InvalidUpload | UploadClosed>;
    readonly finalize: (
      senderId: string,
      transferId: TransferId,
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
      const storage = yield* Storage;

      const owned = (senderId: string, where: { id: TransferId } | { objectKey: string }) =>
        db.query.transfer.findFirst({
          where: { ...where, delivery: { senderId } },
          with: { delivery: true },
        });

      /**
       * Claims the transfer as complete, then flips its delivery to ready when it
       * was the last one. Both updates are conditional, so concurrent finalizes
       * and the sweeper converge, and a cancel stays final.
       */
      const complete = (transfer: Transfer, object: StoredObject) =>
        Effect.gen(function* completeTransfer() {
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
          return claimed.length > 0;
        });

      /**
       * Trusts the object only after closing its key. Nothing is sealed until
       * an object exists, so a paused or still-running upload is never aborted.
       * Then `finalizing` stops new uploads and parts, aborting every open
       * multipart upload kills URLs signed earlier, and the second HEAD reads
       * the object that can no longer change.
       */
      const settle = (transfer: Transfer) =>
        Effect.gen(function* settleTransfer() {
          yield* verify(transfer, yield* storage.head(transfer.objectKey));
          yield* db
            .update(schema.transfer)
            .set({ state: "finalizing" })
            .where(
              and(eq(schema.transfer.id, transfer.id), eq(schema.transfer.state, "uploading")),
            );
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
        ) {
          const transfer = yield* owned(senderId, { id: transferId });
          if (transfer === undefined) {
            return yield* new DeliveryNotFound();
          }
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
          return recovered.reduce((total, count) => total + count, 0);
        }).pipe(Effect.withSpan("Transfers.recoverFinalizing"), dieOnDatabaseError),

        sign: Effect.fn("Transfers.sign")(function* sign(
          senderId: string,
          key: string,
          request: UploadRequest,
        ) {
          const transfer = yield* owned(senderId, { objectKey: key });
          if (transfer === undefined) {
            return yield* new DeliveryNotFound();
          }
          if (transfer.delivery.status !== "open") {
            return yield* new UploadClosed();
          }
          const allowed = Match.value(transfer.state).pipe(
            Match.when("uploading", () => true),
            // Only retries of the final steps; no new upload, no new parts. The
            // empty-file Put is safe to sign again: If-None-Match makes a second
            // write fail, and a lost response must not strand the transfer.
            Match.when(
              "finalizing",
              () =>
                request._tag === "Complete" || request._tag === "List" || request._tag === "Put",
            ),
            Match.orElse(() => false),
          );
          if (!allowed) {
            return yield* new UploadClosed();
          }
          // An empty file is a single guarded PUT; anything else is multipart.
          if ((request._tag === "Put") !== (transfer.size === 0)) {
            return yield* new InvalidUpload();
          }
          if (request._tag === "Part" && request.partNumber > partCount(transfer.size)) {
            return yield* new InvalidUpload();
          }
          // From here the object may land without the browser living to say so;
          // `finalizing` is what the sweeper looks for.
          if (request._tag === "Put" || request._tag === "Complete") {
            yield* db
              .update(schema.transfer)
              .set({ state: "finalizing" })
              .where(
                and(eq(schema.transfer.id, transfer.id), eq(schema.transfer.state, "uploading")),
              );
          }
          return yield* storage.signUpload(key, request);
        }, dieOnDatabaseError),
      });
    }),
  );
}

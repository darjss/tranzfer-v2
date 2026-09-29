import {
  DeliveryNotFound,
  InvalidUpload,
  NotUploaded,
  partCount,
  StorageUnavailable,
  UploadClosed,
  usesMultipart,
} from "@tranzfer/contracts";
import type { Delivery, SignedUrl, TransferId, UploadRequest } from "@tranzfer/contracts";
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
// Multipart uploads R2 has not aborted yet (its lifecycle rule allows 7 days).
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
      const complete = (transfer: Transfer, object: StoredObject, retentionDays: number) =>
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
          // Flip only when this was the last transfer; a no-op otherwise.
          return yield* db
            .update(schema.delivery)
            .set({ expiresAt: new Date(now + retentionDays * DAY_MS), status: "ready" })
            .where(
              and(
                eq(schema.delivery.id, transfer.deliveryId),
                eq(schema.delivery.status, "open"),
                sql`NOT EXISTS (SELECT 1 FROM transfer WHERE delivery_id = ${transfer.deliveryId} AND state != 'complete')`,
              ),
            )
            .pipe(Effect.asVoid);
        });

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
            const object = yield* storage.head(transfer.objectKey).pipe(
              Effect.tapError((error) => Effect.logError("finalize head failed", error.cause)),
              Effect.mapError(() => new StorageUnavailable()),
            );
            const verified = yield* verify(transfer, object);
            yield* complete(transfer, verified, transfer.delivery.retentionDays);
          }
          return yield* deliveries.view(transfer.deliveryId);
        }, dieOnDatabaseError),

        recoverFinalizing: Effect.gen(function* recoverFinalizing() {
          const now = yield* Clock.currentTimeMillis;
          const stuck = yield* db.query.transfer.findMany({
            limit: RECOVER_BATCH,
            where: {
              state: "finalizing",
              updatedAt: {
                gte: new Date(now - Duration.toMillis(RECOVER_WITHIN)),
                lte: new Date(now - Duration.toMillis(RECOVER_AFTER)),
              },
            },
            with: { delivery: { columns: { retentionDays: true } } },
          });
          const recovered = yield* Effect.forEach(
            stuck,
            (transfer) =>
              storage.head(transfer.objectKey).pipe(
                Effect.flatMap((object) => verify(transfer, object)),
                Effect.flatMap((object) =>
                  complete(transfer, object, transfer.delivery.retentionDays),
                ),
                Effect.as(1),
                // Not there yet, the wrong size, cancelled meanwhile, or a storage
                // blip: leave it for the next sweep or the lifecycle rule.
                Effect.catchTags({
                  InvalidUpload: () => Effect.succeed(0),
                  NotUploaded: () => Effect.succeed(0),
                  StorageError: (error) =>
                    Effect.logError("recover head failed", error.cause).pipe(Effect.as(0)),
                  UploadClosed: () => Effect.succeed(0),
                }),
              ),
            { concurrency: 8 },
          );
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
          if (
            transfer.delivery.status !== "open" ||
            (transfer.state !== "uploading" && transfer.state !== "finalizing")
          ) {
            return yield* new UploadClosed();
          }
          if (usesMultipart(transfer.size) === (request._tag === "Put")) {
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

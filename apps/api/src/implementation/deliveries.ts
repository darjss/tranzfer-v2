import { Delivery, DeliveryConflict, DeliveryNotFound } from "@tranzfer/contracts";
import type { DeliveryId, NewDelivery } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { eq, inArray, sql } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";

import { LinkTokens, newLinkId } from "./link-tokens";
import { Storage } from "./storage";

// D1 caps a statement at 100 bound parameters and a transfer row binds 8.
const TRANSFER_ROWS_PER_INSERT = 12;
// Deliveries purged per sweep; each is one list plus one bulk delete per 1000 files.
const PURGE_BATCH = 20;
const CANCEL_SETTLE = Duration.minutes(5);

export const objectPrefix = (deliveryId: DeliveryId) => `d/${deliveryId}/`;

export const isExpired = (expiresAt: Date | null, now: number) =>
  expiresAt !== null && expiresAt.getTime() <= now;

// A retried create replays only when every field matches.
const sameDelivery = (
  senderId: string,
  input: NewDelivery,
  row: typeof schema.delivery.$inferSelect & {
    readonly transfers: readonly (typeof schema.transfer.$inferSelect)[];
  },
) =>
  row.senderId === senderId &&
  row.retentionDays === input.retentionDays &&
  row.title === input.title &&
  row.transfers.length === input.files.length &&
  input.files.every((file) =>
    row.transfers.some(
      (transfer) =>
        transfer.id === file.id && transfer.path === file.path && transfer.size === file.size,
    ),
  );

/** Delivery lifecycle for its sender, plus the purge of what ended. */
export class Deliveries extends Context.Service<
  Deliveries,
  {
    readonly create: (
      senderId: string,
      input: NewDelivery,
    ) => Effect.Effect<Delivery, DeliveryConflict>;
    readonly list: (senderId: string) => Effect.Effect<readonly Delivery[]>;
    /** Stops signing, kills the link, aborts uploads and removes the objects; the sweeper confirms later. */
    readonly cancel: (
      senderId: string,
      deliveryId: DeliveryId,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    readonly view: (deliveryId: DeliveryId) => Effect.Effect<Delivery>;
    /** Removes the objects of cancelled and expired deliveries. Returns how many it purged. */
    readonly purgeEnded: Effect.Effect<number>;
  }
>()("tranzfer/Deliveries") {
  static readonly layer = Layer.effect(
    Deliveries,
    Effect.gen(function* makeDeliveries() {
      const { batch, db } = yield* Database;
      const tokens = yield* LinkTokens;
      const storage = yield* Storage;

      const load = (deliveryId: DeliveryId) =>
        db.query.delivery.findFirst({
          where: { id: deliveryId },
          with: { link: true, transfers: { orderBy: { path: "asc" } } },
        });
      type Row = NonNullable<Effect.Success<ReturnType<typeof load>>>;

      const toView = Effect.fn("Deliveries.toView")(function* toView(row: Row) {
        if (row.link === null) {
          // The link is inserted in the delivery's own batch.
          return yield* Effect.die(new Error(`Delivery ${row.id} has no link`));
        }
        const now = yield* Clock.currentTimeMillis;
        return Delivery.make({
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          id: row.id,
          link: `/d/${yield* tokens.issue(row.link.id)}`,
          retentionDays: row.retentionDays,
          status: row.status === "ready" && isExpired(row.expiresAt, now) ? "expired" : row.status,
          title: row.title,
          transfers: row.transfers.map((transfer) => ({
            id: transfer.id,
            objectKey: transfer.objectKey,
            path: transfer.path,
            size: transfer.size,
            state: transfer.state,
          })),
        });
      });

      const markPurged = (deliveryId: DeliveryId) =>
        Effect.flatMap(Clock.currentTimeMillis, (now) =>
          db

            .update(schema.delivery)

            .set({ purgedAt: new Date(now) })

            .where(eq(schema.delivery.id, deliveryId)),
        );

      const removeObjects = (deliveryId: DeliveryId, objectKeys: readonly string[]) =>
        storage.purge(objectPrefix(deliveryId), objectKeys).pipe(
          Effect.as(true),
          Effect.catchTag("StorageError", (error) =>
            Effect.logError("purge failed", { deliveryId }, error.cause).pipe(Effect.as(false)),
          ),
        );

      const view = Effect.fn("Deliveries.view")(function* view(deliveryId: DeliveryId) {
        const row = yield* load(deliveryId);
        if (row === undefined) {
          return yield* Effect.die(new Error(`Delivery ${deliveryId} vanished`));
        }
        return yield* toView(row);
      }, dieOnDatabaseError);

      return Deliveries.of({
        cancel: Effect.fn("Deliveries.cancel")(function* cancel(
          senderId: string,
          deliveryId: DeliveryId,
        ) {
          const row = yield* load(deliveryId);
          if (row === undefined || row.senderId !== senderId) {
            return yield* new DeliveryNotFound();
          }
          yield* batch([
            db
              .update(schema.delivery)
              .set({ status: "cancelled" })
              .where(eq(schema.delivery.id, deliveryId)),
            db
              .update(schema.transfer)
              .set({ state: "cancelled" })
              .where(eq(schema.transfer.deliveryId, deliveryId)),
          ]);
          yield* removeObjects(
            deliveryId,

            row.transfers.map((transfer) => transfer.objectKey),
          );
          return yield* view(deliveryId);
        }, dieOnDatabaseError),

        create: Effect.fn("Deliveries.create")(function* create(
          senderId: string,
          input: NewDelivery,
        ) {
          const existing = yield* load(input.id);
          if (existing !== undefined) {
            return sameDelivery(senderId, input, existing)
              ? yield* toView(existing)
              : yield* new DeliveryConflict();
          }

          const linkId = yield* newLinkId;
          const inserted = yield* Effect.result(
            batch([
              db.insert(schema.delivery).values({
                id: input.id,
                retentionDays: input.retentionDays,
                senderId,
                title: input.title,
              }),
              ...Arr.chunksOf(input.files, TRANSFER_ROWS_PER_INSERT).map((files) =>
                db.insert(schema.transfer).values(
                  files.map((file) => ({
                    contentType: file.contentType,
                    deliveryId: input.id,
                    id: file.id,
                    objectKey: `${objectPrefix(input.id)}${file.id}`,
                    path: file.path,
                    size: file.size,
                    sourceModifiedAt: new Date(file.lastModified),
                  })),
                ),
              ),
              db.insert(schema.link).values({ deliveryId: input.id, id: linkId }),
            ]),
          );
          if (inserted._tag === "Success") {
            return yield* view(input.id);
          }

          // The batch lost a race or hit a taken transfer id: decide from what landed.
          const landed = yield* load(input.id);
          // One JSON parameter instead of one per id keeps this under D1's cap.
          const taken = yield* db
            .select({ id: schema.transfer.id })
            .from(schema.transfer)
            .where(
              inArray(
                schema.transfer.id,
                sql`(select value from json_each(${JSON.stringify(input.files.map((file) => file.id))}))`,
              ),
            )
            .limit(1);
          return yield* Match.value({ landed, taken: taken.length > 0 }).pipe(
            Match.when(
              { landed: (row) => row !== undefined && sameDelivery(senderId, input, row) },
              () => view(input.id),
            ),
            Match.whenOr({ landed: (row) => row !== undefined }, { taken: true }, () =>
              Effect.fail(new DeliveryConflict()),
            ),
            Match.orElse(() => Effect.die(inserted.failure)),
          );
        }, dieOnDatabaseError),

        list: Effect.fn("Deliveries.list")(function* list(senderId: string) {
          const rows = yield* db.query.delivery.findMany({
            limit: 50,
            orderBy: { createdAt: "desc" },
            where: { senderId },
            with: { link: true, transfers: { orderBy: { path: "asc" } } },
          });
          return yield* Effect.forEach(rows, toView);
        }, dieOnDatabaseError),

        purgeEnded: Effect.gen(function* purgeEnded() {
          const now = yield* Clock.currentTimeMillis;
          const ended = yield* db.query.delivery.findMany({
            columns: { id: true },
            limit: PURGE_BATCH,
            where: {
              OR: [
                // Cancel removed the objects already. A Complete that was in
                // flight at that moment can still land one, so purge again once
                // such requests are long over, and only then record it.
                {
                  status: "cancelled",
                  updatedAt: { lte: new Date(now - Duration.toMillis(CANCEL_SETTLE)) },
                },
                { expiresAt: { lte: new Date(now) }, status: "ready" },
              ],
              purgedAt: { isNull: true },
            },
            with: { transfers: { columns: { objectKey: true } } },
          });
          const purged = yield* Effect.forEach(
            ended,
            (delivery) =>
              removeObjects(
                delivery.id,
                delivery.transfers.map((transfer) => transfer.objectKey),
              ).pipe(Effect.tap((removed) => (removed ? markPurged(delivery.id) : Effect.void))),
            { concurrency: 4 },
          );
          return purged.filter(Boolean).length;
        }).pipe(Effect.withSpan("Deliveries.purgeEnded"), dieOnDatabaseError),

        view,
      });
    }),
  );
}

import type { DeliveryId } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { removeObjects, UPLOAD_WINDOW } from "./deliveries";
import { UPLOAD_URL_TTL } from "./storage";

// Deliveries purged per sweep; each is one list plus one bulk delete per 1000 files.
const PURGE_BATCH = 20;
// A Complete or empty-file Put signed before a cancel can still land an object
// until its URL expires, so the confirming purge waits out the URL's lifetime.
const CANCEL_SETTLE = Duration.sum(UPLOAD_URL_TTL, Duration.minutes(1));

/** Removes the objects of cancelled and expired deliveries. Returns how many it purged. */
export const purgeEnded = Effect.gen(function* purgeEnded() {
  const { batch, db } = yield* Database;
  const now = yield* Clock.currentTimeMillis;
  // A sender who closed the tab and never came back leaves an open
  // delivery behind. End it like a cancel; the purge below cleans up.
  const abandoned = yield* db.query.delivery.findMany({
    columns: { id: true },
    limit: PURGE_BATCH,
    where: {
      createdAt: { lte: new Date(now - Duration.toMillis(UPLOAD_WINDOW)) },
      status: "open",
    },
  });
  if (abandoned.length > 0) {
    const ids = abandoned.map((delivery) => delivery.id);
    yield* batch([
      db
        .update(schema.delivery)
        .set({ status: "cancelled" })
        .where(and(inArray(schema.delivery.id, ids), eq(schema.delivery.status, "open"))),
      // Only transfers of deliveries the statement above really ended:
      // a finalize can flip one to ready between the query and here.
      db
        .update(schema.transfer)
        .set({ state: "cancelled" })
        .where(
          and(
            inArray(schema.transfer.deliveryId, ids),
            exists(
              db
                .select({ one: sql`1` })
                .from(schema.delivery)
                .where(
                  and(
                    eq(schema.delivery.id, schema.transfer.deliveryId),
                    eq(schema.delivery.status, "cancelled"),
                  ),
                ),
            ),
          ),
        ),
    ]);
    yield* Effect.logInfo("abandoned deliveries cancelled", { count: ids.length });
  }
  yield* Effect.annotateCurrentSpan("sweep.abandoned", abandoned.length);
  const ended = yield* db.query.delivery.findMany({
    columns: { id: true },
    limit: PURGE_BATCH,
    orderBy: { updatedAt: "asc" },
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
  const markPurged = (deliveryId: DeliveryId) =>
    Effect.flatMap(Clock.currentTimeMillis, (purgedAt) =>
      db
        .update(schema.delivery)
        .set({ purgedAt: new Date(purgedAt) })
        .where(eq(schema.delivery.id, deliveryId)),
    );
  // A failing row rotates to the back instead of filling every batch.
  // For a cancelled one this also waits CANCEL_SETTLE before the retry.
  const touch = (deliveryId: DeliveryId) =>
    db
      .update(schema.delivery)
      .set({ updatedAt: new Date(now) })
      .where(eq(schema.delivery.id, deliveryId));
  const purged = yield* Effect.forEach(
    ended,
    (delivery) =>
      removeObjects(
        delivery.id,
        delivery.transfers.map((transfer) => transfer.objectKey),
      ).pipe(Effect.tap((removed) => (removed ? markPurged(delivery.id) : touch(delivery.id)))),
    { concurrency: 4 },
  );
  const total = purged.filter(Boolean).length;
  yield* Effect.annotateCurrentSpan({ "sweep.ended": ended.length, "sweep.purged": total });
  return total;
}).pipe(Effect.withSpan("Deliveries.purgeEnded"), dieOnDatabaseError);

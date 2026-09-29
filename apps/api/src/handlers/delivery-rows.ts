import { Delivery } from "@tranzfer/contracts";
import type { Drizzle, schema } from "@tranzfer/db";
import * as Effect from "effect/Effect";

import type { Links } from "../services/links";

export type DeliveryRow = typeof schema.delivery.$inferSelect;

// A predicate on the row, not on `expiresAt`: narrowing `Date | null` would
// wrongly make a future expiry read as null on the false branch.
export const isExpired = (
  delivery: DeliveryRow,
): delivery is DeliveryRow & { readonly expiresAt: Date } =>
  delivery.expiresAt !== null && delivery.expiresAt.getTime() <= Date.now();

// `expired` is computed on read and never stored.
const toDelivery = (row: DeliveryRows, linkToken: string) =>
  new Delivery({
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    id: row.id,
    link: `/d/${linkToken}`,
    retentionDays: row.retentionDays,
    status: row.status === "ready" && isExpired(row) ? "expired" : row.status,
    title: row.title,
    transfers: row.transfers.map((transfer) => ({
      id: transfer.id,
      objectKey: transfer.objectKey,
      path: transfer.path,
      size: transfer.size,
      state: transfer.state,
    })),
  });

export const loadDeliveryRows = (db: Drizzle["Service"], deliveryId: string, op: string) =>
  db.run(
    op,
    async (d) =>
      await d.query.delivery.findFirst({
        where: { id: deliveryId },
        with: { link: true, transfers: { orderBy: { path: "asc" } } },
      }),
  );

export type DeliveryRows = NonNullable<Effect.Success<ReturnType<typeof loadDeliveryRows>>>;

// The link is written in the same batch as the delivery; a missing row is a
// broken invariant, never a not-found.
export const viewFromRows = Effect.fn("Deliveries.viewFromRows")(function* viewFromRows(
  links: Links["Service"],
  row: DeliveryRows,
) {
  if (row.link === null) {
    return yield* Effect.die(new Error(`Delivery ${row.id} has no link row`));
  }
  const token = yield* links.issue(row.link.id);
  return toDelivery(row, token);
});

export const deliveryView = Effect.fn("Deliveries.deliveryView")(function* deliveryView(
  db: Drizzle["Service"],
  links: Links["Service"],
  deliveryId: string,
  op: string,
) {
  const row = yield* loadDeliveryRows(db, deliveryId, op);
  if (row === undefined) {
    return yield* Effect.die(new Error(`Delivery ${deliveryId} vanished after write`));
  }
  return yield* viewFromRows(links, row);
});

import { Delivery } from "@tranzfer/contracts";
import { schema } from "@tranzfer/db";
import type { Drizzle } from "@tranzfer/db";
import { asc, eq } from "drizzle-orm";
import * as Effect from "effect/Effect";

import type { Links } from "../services/links";

export type DeliveryRow = typeof schema.delivery.$inferSelect;
export type TransferRow = typeof schema.transfer.$inferSelect;
type LinkRow = typeof schema.link.$inferSelect;

// A predicate on the row, not on `expiresAt`: narrowing `Date | null` would
// wrongly make a future expiry read as null on the false branch.
export const isExpired = (
  delivery: DeliveryRow,
): delivery is DeliveryRow & { readonly expiresAt: Date } =>
  delivery.expiresAt !== null && delivery.expiresAt.getTime() <= Date.now();

// `expired` is computed on read and never stored.
const toDelivery = (
  delivery: DeliveryRow,
  transfers: readonly TransferRow[],
  linkToken: string,
): Delivery =>
  new Delivery({
    createdAt: delivery.createdAt,
    expiresAt: delivery.expiresAt,
    id: delivery.id,
    link: `/d/${linkToken}`,
    retentionDays: delivery.retentionDays,
    status: delivery.status === "ready" && isExpired(delivery) ? "expired" : delivery.status,
    title: delivery.title,
    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      objectKey: transfer.objectKey,
      path: transfer.path,
      size: transfer.size,
      state: transfer.state,
    })),
  });

// The link is written in the same batch as the delivery; a missing row is a
// broken invariant, never a not-found.
export const viewFromRows = (
  links: Links["Service"],
  delivery: DeliveryRow,
  transfers: readonly TransferRow[],
  link: LinkRow | undefined,
) =>
  Effect.gen(function* view() {
    if (link === undefined) {
      return yield* Effect.die(new Error(`Delivery ${delivery.id} has no link row`));
    }
    const token = yield* links.issue(link.id);
    return toDelivery(delivery, transfers, token);
  });

export const loadDeliveryRows = (db: Drizzle["Service"], deliveryId: string, op: string) =>
  db.run(op, async (d) => {
    const deliveries = await d
      .select()
      .from(schema.delivery)
      .where(eq(schema.delivery.id, deliveryId));
    if (deliveries.length === 0) {
      return null;
    }
    const [transfers, linkRows] = await Promise.all([
      d
        .select()
        .from(schema.transfer)
        .where(eq(schema.transfer.deliveryId, deliveryId))
        .orderBy(asc(schema.transfer.path)),
      d.select().from(schema.link).where(eq(schema.link.deliveryId, deliveryId)),
    ]);
    return { delivery: deliveries[0], link: linkRows[0], transfers };
  });

export const deliveryView = (
  db: Drizzle["Service"],
  links: Links["Service"],
  deliveryId: string,
  op: string,
) =>
  Effect.gen(function* view() {
    const loaded = yield* loadDeliveryRows(db, deliveryId, op);
    if (loaded === null) {
      return yield* Effect.die(new Error(`Delivery ${deliveryId} vanished after write`));
    }
    return yield* viewFromRows(links, loaded.delivery, loaded.transfers, loaded.link);
  });

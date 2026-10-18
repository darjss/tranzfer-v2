import { Delivery } from "@tranzfer/contracts";
import type { DeliveryDownload, DeliveryId } from "@tranzfer/contracts";
import { schema } from "@tranzfer/db";
import type { Database } from "@tranzfer/db";
import { count, inArray, max, min } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type { LinkTokens } from "./link-tokens";

// How `Deliveries` reads a delivery back for its sender: the row, its link and
// what recipients reported.

type Db = Database["Service"]["db"];

export const isExpired = (expiresAt: Date | null, now: number) =>
  expiresAt !== null && expiresAt.getTime() <= now;

export const loadDelivery = (db: Db, deliveryId: DeliveryId) =>
  db.query.delivery.findFirst({
    where: { id: deliveryId },
    with: { link: true, transfers: { orderBy: { path: "asc" } } },
  });
export type DeliveryRow = NonNullable<Effect.Success<ReturnType<typeof loadDelivery>>>;

// What recipients reported, per delivery; one with no reports has no entry.
export const downloadsOf = Effect.fn("Deliveries.downloads")(function* downloadsOf(
  db: Db,
  ids: readonly DeliveryId[],
) {
  const rows = yield* db
    .select({
      deliveryId: schema.download.deliveryId,
      filesSaved: count(schema.download.savedAt),
      lastAt: max(schema.download.lastAt),
      startedAt: min(schema.download.startedAt),
    })
    .from(schema.download)
    .where(inArray(schema.download.deliveryId, ids))
    .groupBy(schema.download.deliveryId);
  return new Map(
    // max and min are null only for an empty group, which groupBy never makes.
    rows.flatMap((row) =>
      row.lastAt === null || row.startedAt === null
        ? []
        : [
            [
              row.deliveryId,
              {
                filesSaved: row.filesSaved,
                lastAt: row.lastAt,
                startedAt: row.startedAt,
              } satisfies DeliveryDownload,
            ],
          ],
    ),
  );
});

export const toView = Effect.fn("Deliveries.toView")(function* toView(
  tokens: LinkTokens["Service"],
  row: DeliveryRow,
  download: DeliveryDownload | null,
) {
  if (row.link === null) {
    // The link is inserted in the delivery's own batch.
    return yield* Effect.die(new Error(`Delivery ${row.id} has no link`));
  }
  const now = yield* Clock.currentTimeMillis;
  return Delivery.make({
    createdAt: row.createdAt,
    download,
    expiresAt: row.expiresAt,
    hasPassword: row.link.passwordHash !== null,
    id: row.id,
    link: `/d/${yield* tokens.issue(row.link.id)}`,
    note: row.note,
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
    uploader:
      row.uploaderName === null ? null : { email: row.uploaderEmail, name: row.uploaderName },
  });
});

import { LinkExpired, LinkNotFound, LinkNotReady } from "@tranzfer/contracts";
import type { DownloadEvent, SharedDelivery } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { isExpired } from "./deliveries";
import { LinkTokens } from "./link-tokens";
import { Storage } from "./storage";

// SigV4's ceiling. A browser resumes a paused download with the URL it started
// with, so a short lifetime broke big downloads; cancel and expiry still end
// them, because the purge deletes the objects every URL points at.
const DOWNLOAD_URL_TTL = Duration.days(7);

const basename = (path: string) => path.split("/").at(-1) ?? path;

/** What anyone holding a link can do: open it, and tell the sender what they downloaded. */
export class SharedLinks extends Context.Service<
  SharedLinks,
  {
    readonly open: (
      token: string,
    ) => Effect.Effect<SharedDelivery, LinkExpired | LinkNotFound | LinkNotReady>;
    /** Best effort: a bad, revoked or ended link, or an unknown path, records nothing. */
    readonly report: (token: string, path: string, event: DownloadEvent) => Effect.Effect<void>;
  }
>()("tranzfer/SharedLinks") {
  static readonly layer = Layer.effect(
    SharedLinks,
    Effect.gen(function* makeSharedLinks() {
      const { db } = yield* Database;
      const tokens = yield* LinkTokens;
      const storage = yield* Storage;

      return SharedLinks.of({
        open: Effect.fn("SharedLinks.open")(function* open(token: string) {
          const linkId = yield* tokens.verify(token);
          if (Option.isNone(linkId)) {
            return yield* new LinkNotFound();
          }
          const link = yield* db.query.link.findFirst({
            where: { id: linkId.value, revokedAt: { isNull: true } },
            with: { delivery: { with: { sender: true, transfers: { orderBy: { path: "asc" } } } } },
          });
          if (link === undefined || link.delivery.status === "cancelled") {
            return yield* new LinkNotFound();
          }
          const { delivery } = link;
          yield* Effect.annotateCurrentSpan({
            "delivery.file_count": delivery.transfers.length,
            "delivery.id": delivery.id,
            "delivery.status": delivery.status,
            "delivery.total_bytes": delivery.transfers.reduce((sum, file) => sum + file.size, 0),
          });
          if (delivery.status === "open") {
            return yield* new LinkNotReady({
              senderName: delivery.sender.name,
              title: delivery.title,
            });
          }
          const now = yield* Clock.currentTimeMillis;
          if (delivery.expiresAt === null) {
            // Finalize sets status and expiry in one statement.
            return yield* Effect.die(new Error(`Ready delivery ${delivery.id} has no expiry`));
          }
          if (isExpired(delivery.expiresAt, now)) {
            return yield* new LinkExpired({ expiredAt: delivery.expiresAt, title: delivery.title });
          }
          // A download URL never outlives the link that issued it.
          const ttl = Duration.min(
            DOWNLOAD_URL_TTL,
            Duration.millis(delivery.expiresAt.getTime() - now),
          );
          const files = yield* Effect.forEach(delivery.transfers, (transfer) =>
            storage
              .signDownload(transfer.objectKey, basename(transfer.path), ttl)
              .pipe(Effect.map(({ url }) => ({ path: transfer.path, size: transfer.size, url }))),
          );
          return {
            expiresAt: delivery.expiresAt,
            files,
            note: delivery.note,
            senderName: delivery.sender.name,
            title: delivery.title,
          };
        }, dieOnDatabaseError),

        // One upsert per file. "started" sets the first time and bumps the
        // last one; "saved" also stamps the file once and keeps that stamp.
        report: Effect.fn("SharedLinks.report")(function* report(
          token: string,
          path: string,
          event: DownloadEvent,
        ) {
          yield* Effect.annotateCurrentSpan("download.event", event);
          const linkId = yield* tokens.verify(token);
          if (Option.isNone(linkId)) {
            return;
          }
          const now = new Date(yield* Clock.currentTimeMillis);
          yield* db
            .insert(schema.download)
            .select((qb) =>
              qb
                .select({
                  deliveryId: schema.transfer.deliveryId,
                  lastAt: sql<Date>`${now.getTime()}`.as("last_at"),
                  savedAt: sql<Date | null>`${event === "saved" ? now.getTime() : null}`.as(
                    "saved_at",
                  ),
                  startedAt: sql<Date>`${now.getTime()}`.as("started_at"),
                  transferId: schema.transfer.id,
                })
                .from(schema.link)
                .innerJoin(schema.delivery, eq(schema.delivery.id, schema.link.deliveryId))
                .innerJoin(schema.transfer, eq(schema.transfer.deliveryId, schema.delivery.id))
                .where(
                  and(
                    eq(schema.link.id, linkId.value),
                    isNull(schema.link.revokedAt),
                    eq(schema.delivery.status, "ready"),
                    gt(schema.delivery.expiresAt, now),
                    eq(schema.transfer.path, path),
                  ),
                ),
            )
            .onConflictDoUpdate({
              set: {
                lastAt: sql`excluded.last_at`,
                savedAt: sql`coalesce(${schema.download.savedAt}, excluded.saved_at)`,
              },
              target: schema.download.transferId,
            });
        }, dieOnDatabaseError),
      });
    }),
  );
}

import {
  Api,
  LinkExpired,
  LinkNotFound,
  LinkNotReady,
  StorageUnavailable,
} from "@tranzfer/contracts";
import { Drizzle, schema } from "@tranzfer/db";
import { eq, isNull, and } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Links } from "../services/links";
import { Storage } from "../services/storage";

const storageUnavailable = Effect.mapError(
  () => new StorageUnavailable({ message: "Storage is unavailable. Try again." }),
);

const basename = (path: string) => path.split("/").at(-1) ?? path;

export const LinkHandlers = Api.toLayerHandler(
  "OpenLink",
  Effect.fn("LinkHandlers.OpenLink")(
    function* openLink(input: { readonly token: string }) {
      const db = yield* Drizzle;
      const links = yield* Links;
      const storage = yield* Storage;

      const linkId = yield* links.verify(input.token);
      if (Option.isNone(linkId)) {
        return yield* new LinkNotFound({ message: "This link is not valid" });
      }

      const rows = yield* db.run("links.open.lookup", (d) =>
        d
          .select({ delivery: schema.delivery, sender: schema.user })
          .from(schema.link)
          .innerJoin(schema.delivery, eq(schema.link.deliveryId, schema.delivery.id))
          .innerJoin(schema.user, eq(schema.delivery.senderId, schema.user.id))
          .where(and(eq(schema.link.id, linkId.value), isNull(schema.link.revokedAt))),
      );
      const [row] = rows;
      // Cancelled, unknown and bad-signature links all look the same.
      if (row === undefined || row.delivery.status === "cancelled") {
        return yield* new LinkNotFound({ message: "This link is not valid" });
      }

      const { delivery, sender } = row;
      if (delivery.status === "open") {
        return yield* new LinkNotReady({
          message: "This delivery is not ready yet",
          senderName: sender.name,
          title: delivery.title,
        });
      }
      if (delivery.expiresAt !== null && delivery.expiresAt.getTime() <= Date.now()) {
        return yield* new LinkExpired({
          expiredAt: delivery.expiresAt,
          message: "This link has expired",
          title: delivery.title,
        });
      }

      const transfers = yield* db.run("links.open.transfers", (d) =>
        d.select().from(schema.transfer).where(eq(schema.transfer.deliveryId, delivery.id)),
      );

      const files = yield* Effect.all(
        transfers.map((transfer) =>
          storage.signDownload(transfer.objectKey, basename(transfer.path)).pipe(
            Effect.tapError((error) => Effect.logError("signDownload failed", error.cause)),
            storageUnavailable,
            Effect.map((signed) => ({
              path: transfer.path,
              size: transfer.size,
              url: signed.url,
            })),
          ),
        ),
        { concurrency: 8 },
      );

      return {
        expiresAt: delivery.expiresAt,
        files,
        senderName: sender.name,
        title: delivery.title,
      };
    },
    Effect.catchTag("DrizzleError", Effect.die),
  ),
);

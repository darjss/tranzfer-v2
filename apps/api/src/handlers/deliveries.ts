import {
  Api,
  CurrentPrincipal,
  Delivery,
  DeliveryConflict,
  DeliveryNotFound,
  InvalidUpload,
  NotUploaded,
  partCount,
  StorageUnavailable,
  UploadClosed,
  usesMultipart,
} from "@tranzfer/contracts";
import type { NewDelivery, UploadRequest } from "@tranzfer/contracts";
import { Drizzle, schema } from "@tranzfer/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Links, newLinkId } from "../services/links";
import { Storage } from "../services/storage";
import type { StorageError } from "../services/storage-error";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCEL_CONCURRENCY = 8;

type DeliveryRow = typeof schema.delivery.$inferSelect;
type TransferRow = typeof schema.transfer.$inferSelect;

const objectKey = (deliveryId: string, transferId: string) => `d/${deliveryId}/${transferId}`;

const storageUnavailable = Effect.mapError(
  () => new StorageUnavailable({ message: "Storage is unavailable. Try again." }),
);

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
    status:
      delivery.status === "ready" &&
      delivery.expiresAt !== null &&
      delivery.expiresAt.getTime() <= Date.now()
        ? "expired"
        : delivery.status,
    title: delivery.title,
    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      objectKey: transfer.objectKey,
      path: transfer.path,
      size: transfer.size,
      state: transfer.state,
    })),
  });

const sameFileSet = (files: NewDelivery["files"], transfers: readonly TransferRow[]) =>
  files.length === transfers.length &&
  files.every((file) =>
    transfers.some(
      (transfer) =>
        transfer.id === file.id && transfer.path === file.path && transfer.size === file.size,
    ),
  );

const loadDelivery = (db: Drizzle["Service"], deliveryId: string, op: string) =>
  db.run(op, async (d) => {
    const deliveries = await d
      .select()
      .from(schema.delivery)
      .where(eq(schema.delivery.id, deliveryId));
    if (deliveries.length === 0) {
      return null;
    }
    const [transfers, links] = await Promise.all([
      d.select().from(schema.transfer).where(eq(schema.transfer.deliveryId, deliveryId)),
      d.select().from(schema.link).where(eq(schema.link.deliveryId, deliveryId)),
    ]);
    return { delivery: deliveries[0], link: links[0], transfers };
  });

export const DeliveriesHandlers = Layer.mergeAll(
  Api.toLayerHandler(
    "CreateDelivery",
    Effect.fn("DeliveriesHandlers.CreateDelivery")(
      function* create(input: NewDelivery) {
        const db = yield* Drizzle;
        const links = yield* Links;
        const principal = yield* CurrentPrincipal;

        const existing = yield* loadDelivery(db, input.id, "deliveries.create.lookup");
        if (existing !== null) {
          if (
            existing.delivery.senderId === principal.id &&
            sameFileSet(input.files, existing.transfers)
          ) {
            const token = yield* links.issue(existing.link?.id ?? "");
            return toDelivery(existing.delivery, existing.transfers, token);
          }
          return yield* new DeliveryConflict({ message: "Delivery already exists" });
        }

        // A transfer id already bound to another delivery is also a conflict.
        const transferIds = input.files.map((file) => file.id);
        const used = yield* db.run("deliveries.create.transferIds", (d) =>
          d
            .select({ id: schema.transfer.id })
            .from(schema.transfer)
            .where(inArray(schema.transfer.id, transferIds)),
        );
        if (used.length > 0) {
          return yield* new DeliveryConflict({ message: "Delivery already exists" });
        }

        const linkId = newLinkId();
        yield* db
          .run(
            "deliveries.create.insert",
            async (d) =>
              await d.batch([
                d.insert(schema.delivery).values({
                  id: input.id,
                  retentionDays: input.retentionDays,
                  senderId: principal.id,
                  title: input.title,
                }),
                d.insert(schema.transfer).values(
                  input.files.map((file) => ({
                    contentType: file.contentType,
                    deliveryId: input.id,
                    id: file.id,
                    objectKey: objectKey(input.id, file.id),
                    path: file.path,
                    size: file.size,
                    sourceModifiedAt: new Date(file.lastModified),
                  })),
                ),
                d.insert(schema.link).values({ deliveryId: input.id, id: linkId }),
              ]),
          )
          .pipe(
            // A concurrent create with the same client ids surfaces as a
            // constraint violation; report it as a conflict, not an outage.
            Effect.mapError(() => new DeliveryConflict({ message: "Delivery already exists" })),
          );

        const token = yield* links.issue(linkId);
        const now = new Date();
        return toDelivery(
          {
            createdAt: now,
            expiresAt: null,
            id: input.id,
            retentionDays: input.retentionDays,
            senderId: principal.id,
            status: "open",
            title: input.title,
            updatedAt: now,
          },
          input.files.map((file) => ({
            completedAt: null,
            contentType: file.contentType,
            createdAt: now,
            deliveryId: input.id,
            etag: null,
            id: file.id,
            objectKey: objectKey(input.id, file.id),
            path: file.path,
            size: file.size,
            sourceModifiedAt: new Date(file.lastModified),
            state: "uploading",
            updatedAt: now,
          })),
          token,
        );
      },
      Effect.catchTag("DrizzleError", Effect.die),
    ),
  ),

  Api.toLayerHandler(
    "Deliveries",
    Effect.fn("DeliveriesHandlers.Deliveries")(
      function* deliveries() {
        const db = yield* Drizzle;
        const links = yield* Links;
        const principal = yield* CurrentPrincipal;

        const rows = yield* db.run("deliveries.list", async (d) => {
          const found = await d
            .select()
            .from(schema.delivery)
            .where(eq(schema.delivery.senderId, principal.id))
            .orderBy(desc(schema.delivery.createdAt))
            .limit(50);
          if (found.length === 0) {
            return { deliveries: [], links: [], transfers: [] };
          }
          const ids = found.map((delivery) => delivery.id);
          const [transfers, linkRows] = await Promise.all([
            d.select().from(schema.transfer).where(inArray(schema.transfer.deliveryId, ids)),
            d.select().from(schema.link).where(inArray(schema.link.deliveryId, ids)),
          ]);
          return { deliveries: found, links: linkRows, transfers };
        });

        const result: Delivery[] = [];
        for (const delivery of rows.deliveries) {
          const link = rows.links.find((l) => l.deliveryId === delivery.id);
          const token = yield* links.issue(link?.id ?? "");
          result.push(
            toDelivery(
              delivery,
              rows.transfers.filter((t) => t.deliveryId === delivery.id),
              token,
            ),
          );
        }
        return result;
      },
      Effect.catchTag("DrizzleError", Effect.die),
    ),
  ),

  Api.toLayerHandler(
    "SignUpload",
    Effect.fn("DeliveriesHandlers.SignUpload")(
      function* signUpload(input: { readonly key: string; readonly request: UploadRequest }) {
        const db = yield* Drizzle;
        const storage = yield* Storage;
        const principal = yield* CurrentPrincipal;

        const rows = yield* db.run("deliveries.signUpload.lookup", (d) =>
          d
            .select({ delivery: schema.delivery, transfer: schema.transfer })
            .from(schema.transfer)
            .innerJoin(schema.delivery, eq(schema.transfer.deliveryId, schema.delivery.id))
            .where(eq(schema.transfer.objectKey, input.key)),
        );
        const row = rows.find((r) => r.delivery.senderId === principal.id);
        if (row === undefined) {
          return yield* new DeliveryNotFound({ message: "Delivery not found" });
        }

        const { delivery, transfer } = row;
        if (
          delivery.status !== "open" ||
          (transfer.state !== "uploading" && transfer.state !== "finalizing")
        ) {
          return yield* new UploadClosed({ message: "This transfer is closed" });
        }

        const multipart = usesMultipart(transfer.size);
        const tag = input.request._tag;
        if (
          (multipart && (tag === "Put" || transfer.size === 0)) ||
          (!multipart && tag !== "Put")
        ) {
          return yield* new InvalidUpload({ message: "Upload shape does not match the file size" });
        }
        if (tag === "Part" && input.request.partNumber > partCount(transfer.size)) {
          return yield* new InvalidUpload({ message: "Part number is out of range" });
        }

        // The client supplies the uploadId, but we only ever sign for the
        // transfer's own key, and R2 binds an upload id to its key, so a
        // foreign id is useless. There is no abort op: cancel is server-side.
        if (tag === "Complete") {
          yield* db.run("deliveries.signUpload.finalizing", (d) =>
            d
              .update(schema.transfer)
              .set({ state: "finalizing" })
              .where(
                and(eq(schema.transfer.id, transfer.id), eq(schema.transfer.state, "uploading")),
              ),
          );
        }

        return yield* storage.signUpload(input.key, input.request).pipe(
          Effect.tapError((error) => Effect.logError("signUpload failed", error.cause)),
          storageUnavailable,
        );
      },
      Effect.catchTag("DrizzleError", Effect.die),
    ),
  ),

  Api.toLayerHandler(
    "FinalizeTransfer",
    Effect.fn("DeliveriesHandlers.FinalizeTransfer")(
      function* finalize(input: { readonly transferId: string }) {
        const db = yield* Drizzle;
        const links = yield* Links;
        const storage = yield* Storage;
        const principal = yield* CurrentPrincipal;

        const rows = yield* db.run("deliveries.finalize.lookup", (d) =>
          d
            .select({ delivery: schema.delivery, transfer: schema.transfer })
            .from(schema.transfer)
            .innerJoin(schema.delivery, eq(schema.transfer.deliveryId, schema.delivery.id))
            .where(eq(schema.transfer.id, input.transferId)),
        );
        const row = rows.find((r) => r.delivery.senderId === principal.id);
        if (row === undefined) {
          return yield* new DeliveryNotFound({ message: "Delivery not found" });
        }
        const { delivery, transfer } = row;

        if (transfer.state === "complete") {
          const loaded = yield* loadDelivery(db, delivery.id, "deliveries.finalize.reload");
          const token = yield* links.issue(loaded?.link?.id ?? "");
          return toDelivery(delivery, loaded?.transfers ?? [transfer], token);
        }
        if (transfer.state === "cancelled") {
          return yield* new UploadClosed({ message: "This transfer is closed" });
        }

        const object = yield* storage.head(transfer.objectKey).pipe(
          Effect.tapError((error) => Effect.logError("finalize head failed", error.cause)),
          storageUnavailable,
        );
        if (Option.isNone(object)) {
          return yield* new NotUploaded({ message: "The object is not uploaded yet" });
        }
        if (object.value.size !== transfer.size) {
          yield* Effect.logError("finalize size mismatch", {
            deliveryId: delivery.id,
            expected: transfer.size,
            found: object.value.size,
            transferId: transfer.id,
          });
          // Keep the object: it is evidence of whatever went wrong.
          return yield* new InvalidUpload({ message: "Uploaded size does not match" });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + delivery.retentionDays * DAY_MS);
        yield* db.run(
          "deliveries.finalize.complete",
          async (d) =>
            await d.batch([
              d
                .update(schema.transfer)
                .set({ completedAt: now, etag: object.value.etag, state: "complete" })
                .where(eq(schema.transfer.id, transfer.id)),
              // The last file flips the delivery exactly once, even under
              // concurrent finalizes.
              d
                .update(schema.delivery)
                .set({ expiresAt, status: "ready" })
                .where(
                  and(
                    eq(schema.delivery.id, delivery.id),
                    eq(schema.delivery.status, "open"),
                    sql`NOT EXISTS (SELECT 1 FROM transfer WHERE delivery_id = ${delivery.id} AND state != 'complete')`,
                  ),
                ),
            ]),
        );

        const loaded = yield* loadDelivery(db, delivery.id, "deliveries.finalize.reload");
        const token = yield* links.issue(loaded?.link?.id ?? "");
        return toDelivery(loaded?.delivery ?? delivery, loaded?.transfers ?? [], token);
      },
      Effect.catchTag("DrizzleError", Effect.die),
    ),
  ),

  Api.toLayerHandler(
    "CancelDelivery",
    Effect.fn("DeliveriesHandlers.CancelDelivery")(
      function* cancel(input: { readonly deliveryId: string }) {
        const db = yield* Drizzle;
        const links = yield* Links;
        const storage = yield* Storage;
        const principal = yield* CurrentPrincipal;

        const loaded = yield* loadDelivery(db, input.deliveryId, "deliveries.cancel.lookup");
        if (loaded === null || loaded.delivery.senderId !== principal.id) {
          return yield* new DeliveryNotFound({ message: "Delivery not found" });
        }

        // D1 first, so signing stops at once. Already-cancelled deliveries run
        // the cleanup again, which is what lets retries finish a half-done one.
        yield* db.run(
          "deliveries.cancel.mark",
          async (d) =>
            await d.batch([
              d
                .update(schema.delivery)
                .set({ status: "cancelled" })
                .where(eq(schema.delivery.id, input.deliveryId)),
              d
                .update(schema.transfer)
                .set({ state: "cancelled" })
                .where(eq(schema.transfer.deliveryId, input.deliveryId)),
            ]),
        );

        yield* Effect.all(
          loaded.transfers.map((transfer) =>
            storage.abortUploads(transfer.objectKey).pipe(
              Effect.andThen(() => storage.remove(transfer.objectKey)),
              Effect.tapError((error: StorageError) =>
                Effect.logError("cancel cleanup failed", error.cause),
              ),
              Effect.ignore,
            ),
          ),
          { concurrency: CANCEL_CONCURRENCY },
        );

        const token = yield* links.issue(loaded.link?.id ?? "");
        return toDelivery(
          { ...loaded.delivery, status: "cancelled" },
          loaded.transfers.map((transfer) => ({ ...transfer, state: "cancelled" })),
          token,
        );
      },
      Effect.catchTag("DrizzleError", Effect.die),
    ),
  ),
);

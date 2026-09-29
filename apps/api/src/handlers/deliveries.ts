import {
  Api,
  CurrentPrincipal,
  DeliveryConflict,
  DeliveryNotFound,
  InvalidUpload,
  NotUploaded,
  partCount,
  UploadClosed,
  usesMultipart,
} from "@tranzfer/contracts";
import type { NewDelivery, UploadRequest } from "@tranzfer/contracts";
import { Drizzle, schema } from "@tranzfer/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";

import { Links, newLinkId } from "../services/links";
import { Storage, toStorageUnavailable } from "../services/storage";
import { deliveryView, loadDeliveryRows, viewFromRows } from "./delivery-rows";
import type { DeliveryRows } from "./delivery-rows";

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCEL_CONCURRENCY = 8;

const objectKey = (deliveryId: string, transferId: string) => `d/${deliveryId}/${transferId}`;

const sameFileSet = (files: NewDelivery["files"], transfers: DeliveryRows["transfers"]) =>
  files.length === transfers.length &&
  files.every((file) =>
    transfers.some(
      (transfer) =>
        transfer.id === file.id && transfer.path === file.path && transfer.size === file.size,
    ),
  );

// A retried create only replays when every field matches; a changed payload
// under the same id is a conflict, not a silent accept.
const sameDelivery = (input: NewDelivery, senderId: string, row: DeliveryRows) =>
  row.senderId === senderId &&
  row.retentionDays === input.retentionDays &&
  row.title === input.title &&
  sameFileSet(input.files, row.transfers);

export const DeliveriesHandlers = Layer.mergeAll(
  Api.toLayerHandler(
    "CreateDelivery",
    Effect.fn("DeliveriesHandlers.CreateDelivery")(
      function* create(input: NewDelivery) {
        const db = yield* Drizzle;
        const links = yield* Links;
        const principal = yield* CurrentPrincipal;

        const existing = yield* loadDeliveryRows(db, input.id, "deliveries.create.lookup");
        if (existing !== undefined) {
          if (sameDelivery(input, principal.id, existing)) {
            return yield* deliveryView(db, links, input.id, "deliveries.create.view");
          }
          return yield* new DeliveryConflict({ message: "Delivery already exists" });
        }

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

        const inserted = yield* Effect.result(
          db.run(
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
                d.insert(schema.link).values({ deliveryId: input.id, id: newLinkId() }),
              ]),
          ),
        );
        if (Result.isFailure(inserted)) {
          // The insert raced a concurrent create: re-read before deciding who
          // failed.
          const landed = yield* loadDeliveryRows(db, input.id, "deliveries.create.relookup");
          const taken = yield* db.run("deliveries.create.retaken", (d) =>
            d
              .select({ id: schema.transfer.id })
              .from(schema.transfer)
              .where(inArray(schema.transfer.id, transferIds)),
          );
          return yield* Match.value({ landed, taken: taken.length > 0 }).pipe(
            Match.when(
              { landed: (row) => row !== undefined && sameDelivery(input, principal.id, row) },
              () => deliveryView(db, links, input.id, "deliveries.create.view"),
            ),
            Match.whenOr({ landed: Predicate.isNotUndefined }, { taken: true }, () =>
              Effect.fail(new DeliveryConflict({ message: "Delivery already exists" })),
            ),
            Match.orElse(() => Effect.fail(inserted.failure)),
          );
        }

        return yield* deliveryView(db, links, input.id, "deliveries.create.view");
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

        const rows = yield* db.run(
          "deliveries.list",
          async (d) =>
            await d.query.delivery.findMany({
              limit: 50,
              orderBy: { createdAt: "desc" },
              where: { senderId: principal.id },
              with: { link: true, transfers: true },
            }),
        );

        return yield* Effect.forEach(rows, (row) => viewFromRows(links, row));
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

        const transfer = yield* db.run(
          "deliveries.signUpload.lookup",
          async (d) =>
            await d.query.transfer.findFirst({
              where: { delivery: { senderId: principal.id }, objectKey: input.key },
              with: { delivery: true },
            }),
        );
        if (transfer === undefined) {
          return yield* new DeliveryNotFound({ message: "Delivery not found" });
        }

        const { delivery } = transfer;
        if (
          delivery.status !== "open" ||
          (transfer.state !== "uploading" && transfer.state !== "finalizing")
        ) {
          return yield* new UploadClosed({ message: "This transfer is closed" });
        }

        const multipart = usesMultipart(transfer.size);
        const tag = input.request._tag;
        if (multipart === (tag === "Put")) {
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

        return yield* storage
          .signUpload(input.key, input.request)
          .pipe(toStorageUnavailable("signUpload failed"));
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

        const transfer = yield* db.run(
          "deliveries.finalize.lookup",
          async (d) =>
            await d.query.transfer.findFirst({
              where: { delivery: { senderId: principal.id }, id: input.transferId },
              with: { delivery: true },
            }),
        );
        if (transfer === undefined) {
          return yield* new DeliveryNotFound({ message: "Delivery not found" });
        }
        const { delivery } = transfer;

        if (transfer.state === "complete") {
          return yield* deliveryView(db, links, delivery.id, "deliveries.finalize.view");
        }
        if (transfer.state === "cancelled") {
          return yield* new UploadClosed({ message: "This transfer is closed" });
        }

        const object = yield* storage
          .head(transfer.objectKey)
          .pipe(toStorageUnavailable("finalize head failed"));
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
        // The transfer guard keeps a concurrent cancel final: without it a
        // finalize racing CancelDelivery would resurrect a deleted object.
        const [completed] = yield* db.run(
          "deliveries.finalize.complete",
          async (d) =>
            await d.batch([
              d
                .update(schema.transfer)
                .set({ completedAt: now, etag: object.value.etag, state: "complete" })
                .where(
                  and(eq(schema.transfer.id, transfer.id), ne(schema.transfer.state, "cancelled")),
                ),
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
        if (completed.meta.changes === 0) {
          const current = yield* db.run("deliveries.finalize.relookup", (d) =>
            d
              .select({ state: schema.transfer.state })
              .from(schema.transfer)
              .where(eq(schema.transfer.id, transfer.id)),
          );
          if (current[0]?.state === "cancelled") {
            return yield* new UploadClosed({ message: "This transfer is closed" });
          }
          return yield* Effect.die(
            new Error(`Transfer ${transfer.id} changed state during finalize`),
          );
        }

        return yield* deliveryView(db, links, delivery.id, "deliveries.finalize.view");
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

        const loaded = yield* loadDeliveryRows(db, input.deliveryId, "deliveries.cancel.lookup");
        if (loaded === undefined || loaded.senderId !== principal.id) {
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

        yield* Effect.forEach(
          loaded.transfers,
          (transfer) =>
            storage.abortUploads(transfer.objectKey).pipe(
              Effect.andThen(() => storage.remove(transfer.objectKey)),
              toStorageUnavailable("cancel cleanup failed"),
            ),
          { concurrency: CANCEL_CONCURRENCY },
        );

        return yield* deliveryView(db, links, input.deliveryId, "deliveries.cancel.view");
      },
      Effect.catchTag("DrizzleError", Effect.die),
    ),
  ),
);

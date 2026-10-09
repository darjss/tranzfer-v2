import {
  FileRequest,
  OpenedRequest,
  plans,
  RateLimited,
  rateLimits,
  RequestId,
  RequestNotFound,
  RetentionNotInPlan,
} from "@tranzfer/contracts";
import type {
  DeliveryNotFound,
  DeliveryConflict,
  DeliveryRefused,
  InvalidUpload,
  NewFileRequest,
  NewRequestUpload,
  NotUploaded,
  RequestFull,
  RequestUpload,
  SignedUrl,
  StorageUnavailable,
  TransferId,
  UploadClosed,
  UploadRequest,
  Delivery,
  DeliveryId,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Deliveries } from "./deliveries";
import { LinkTokens, newLinkId } from "./link-tokens";
import { Plans } from "./plans";
import { Transfers } from "./transfers";

type Row = typeof schema.fileRequest.$inferSelect;

// The uploader sees their own files and their state, never the owner's link.
const toUpload = (delivery: Delivery): RequestUpload => ({
  id: delivery.id,
  status: delivery.status,
  title: delivery.title,
  transfers: delivery.transfers,
});

const limited = (limit: keyof typeof rateLimits & `portal${string}`) =>
  new RateLimited({ limit, retryAfterSeconds: rateLimits[limit].windowSeconds });

const statusOf = (row: Row, now: number) => {
  if (row.closedAt !== null) {
    return "closed";
  }
  return row.expiresAt.getTime() <= now ? "expired" : "open";
};

/**
 * Counts one portal call, true while it fits. Cloudflare's rate-limit
 * bindings, one namespace per rule, set to `rateLimits.portal*`.
 */
interface PortalRates {
  readonly callsPerIp: (ip: string) => Effect.Effect<boolean>;
  readonly callsPerRequest: (requestId: string) => Effect.Effect<boolean>;
  readonly uploadsPerIp: (ip: string) => Effect.Effect<boolean>;
}

/**
 * File requests: a link its owner hands to someone without an account, who
 * uploads straight into the owner's space. The owner makes, lists and closes
 * them. The uploader's calls take the link's token, and every one of them
 * checks it is still live and counts against the caller's IP and the request.
 */
export class FileRequests extends Context.Service<
  FileRequests,
  {
    readonly create: (
      ownerId: string,
      input: NewFileRequest,
    ) => Effect.Effect<FileRequest, RetentionNotInPlan>;
    readonly list: (ownerId: string) => Effect.Effect<readonly FileRequest[]>;
    /** Ends the request now. Closing again changes nothing. */
    readonly close: (
      ownerId: string,
      requestId: RequestId,
    ) => Effect.Effect<FileRequest, RequestNotFound>;
    readonly open: (
      token: string,
      ip: string,
    ) => Effect.Effect<OpenedRequest, RateLimited | RequestNotFound>;
    readonly receive: (
      input: NewRequestUpload,
      ip: string,
    ) => Effect.Effect<
      RequestUpload,
      DeliveryConflict | DeliveryRefused | RateLimited | RequestFull | RequestNotFound
    >;
    readonly sign: (
      token: string,
      ip: string,
      key: string,
      request: UploadRequest,
    ) => Effect.Effect<
      SignedUrl,
      DeliveryNotFound | InvalidUpload | RateLimited | RequestNotFound | UploadClosed
    >;
    readonly finalize: (
      token: string,
      ip: string,
      transferId: TransferId,
    ) => Effect.Effect<
      RequestUpload,
      | DeliveryNotFound
      | InvalidUpload
      | NotUploaded
      | RateLimited
      | RequestNotFound
      | StorageUnavailable
      | UploadClosed
    >;
    /** The uploads among these ids that came in through the token's request. */
    readonly uploads: (
      token: string,
      ip: string,
      deliveryIds: readonly DeliveryId[],
    ) => Effect.Effect<readonly RequestUpload[], RateLimited | RequestNotFound>;
  }
>()("tranzfer/FileRequests") {
  static readonly layer = (rates: PortalRates) =>
    Layer.effect(
      FileRequests,
      Effect.gen(function* makeFileRequests() {
        const { db } = yield* Database;
        const deliveries = yield* Deliveries;
        const tokens = yield* LinkTokens;
        const userPlans = yield* Plans;
        const transfers = yield* Transfers;

        // Uploads and bytes per request, counting what was not cancelled.
        const totalsOf = Effect.fn("FileRequests.totals")(function* totalsOf(
          ids: readonly RequestId[],
        ) {
          const rows = yield* db
            .select({
              receivedBytes: sql<number>`coalesce(sum(${schema.transfer.size}), 0)`,
              requestId: schema.delivery.requestId,
              uploads: sql<number>`count(distinct ${schema.delivery.id})`,
            })
            .from(schema.delivery)
            .leftJoin(schema.transfer, eq(schema.transfer.deliveryId, schema.delivery.id))
            .where(
              and(
                inArray(schema.delivery.requestId, [...ids]),
                ne(schema.delivery.status, "cancelled"),
              ),
            )
            .groupBy(schema.delivery.requestId);
          return new Map(rows.map((row) => [row.requestId, row]));
        });

        const views = Effect.fn("FileRequests.views")(function* views(rows: readonly Row[]) {
          const totals = yield* totalsOf(rows.map((row) => row.id));
          const now = yield* Clock.currentTimeMillis;
          return yield* Effect.forEach(rows, (row) =>
            Effect.map(tokens.issue(row.id), (token) => {
              const total = totals.get(row.id);
              return FileRequest.make({
                createdAt: row.createdAt,
                expiresAt: row.expiresAt,
                id: row.id,
                instructions: row.instructions,
                link: `/r/${token}`,
                maxBytes: row.maxBytes,
                receivedBytes: total?.receivedBytes ?? 0,
                retentionDays: row.retentionDays,
                status: statusOf(row, now),
                title: row.title,
                uploads: total?.uploads ?? 0,
              });
            }),
          );
        });

        const viewOne = Effect.fn("FileRequests.viewOne")(function* viewOne(row: Row) {
          const [view] = yield* views([row]);
          return view ?? (yield* Effect.die(new Error(`Request ${row.id} has no view`)));
        });

        // The one gate for every uploader call: the caller's IP is counted
        // first, so floods of bad tokens are limited too, then the token must
        // verify and name a request that is open and unexpired, then the
        // request is counted.
        const live = Effect.fn("FileRequests.live")(function* live(token: string, ip: string) {
          if (!(yield* rates.callsPerIp(ip))) {
            return yield* limited("portalCallsPerIp");
          }
          const id = yield* tokens.verify(token);
          if (Option.isNone(id)) {
            return yield* new RequestNotFound();
          }
          const now = yield* Clock.currentTimeMillis;
          const row = yield* db.query.fileRequest.findFirst({
            where: {
              closedAt: { isNull: true },
              expiresAt: { gt: new Date(now) },
              id: RequestId.make(id.value),
            },
            with: { owner: true },
          });
          if (row === undefined) {
            return yield* new RequestNotFound();
          }
          yield* Effect.annotateCurrentSpan("request.id", row.id);
          if (!(yield* rates.callsPerRequest(row.id))) {
            return yield* limited("portalCallsPerRequest");
          }
          return row;
        }, dieOnDatabaseError);

        return FileRequests.of({
          close: Effect.fn("FileRequests.close")(function* close(
            ownerId: string,
            requestId: RequestId,
          ) {
            yield* Effect.annotateCurrentSpan("request.id", requestId);
            const now = yield* Clock.currentTimeMillis;
            // The owner check is part of the statement, so a foreign or missing
            // id changes nothing and reads the same. Keeping the first
            // closing time makes a second close a no-op.
            const [closed] = yield* db
              .update(schema.fileRequest)
              .set({ closedAt: sql`coalesce(${schema.fileRequest.closedAt}, ${now})` })
              .where(
                and(eq(schema.fileRequest.id, requestId), eq(schema.fileRequest.ownerId, ownerId)),
              )
              .returning();
            if (closed === undefined) {
              return yield* new RequestNotFound();
            }
            return yield* viewOne(closed);
          }, dieOnDatabaseError),

          create: Effect.fn("FileRequests.create")(function* create(
            ownerId: string,
            input: NewFileRequest,
          ) {
            const { plan } = yield* userPlans.current(ownerId);
            if (input.retentionDays > plans[plan].maxRetentionDays) {
              return yield* new RetentionNotInPlan({
                maxRetentionDays: plans[plan].maxRetentionDays,
                plan,
                requestedDays: input.retentionDays,
              });
            }
            const now = yield* Clock.currentTimeMillis;
            const id = RequestId.make(yield* newLinkId);
            yield* Effect.annotateCurrentSpan({
              "request.id": id,
              "request.retention_days": input.retentionDays,
            });
            const [created] = yield* db
              .insert(schema.fileRequest)
              .values({
                expiresAt: new Date(now + Duration.toMillis(Duration.days(input.retentionDays))),
                id,
                instructions: input.instructions,
                maxBytes: input.maxBytes,
                ownerId,
                retentionDays: input.retentionDays,
                title: input.title,
              })
              .returning();
            if (created === undefined) {
              return yield* Effect.die(new Error(`Request ${id} was not inserted`));
            }
            return yield* viewOne(created);
          }, dieOnDatabaseError),

          finalize: Effect.fn("FileRequests.finalize")(function* finalize(
            token: string,
            ip: string,
            transferId: TransferId,
          ) {
            const request = yield* live(token, ip);
            return toUpload(yield* transfers.finalize(request.ownerId, transferId, request.id));
          }),

          list: Effect.fn("FileRequests.list")(function* list(ownerId: string) {
            const rows = yield* db
              .select()
              .from(schema.fileRequest)
              .where(eq(schema.fileRequest.ownerId, ownerId))
              .orderBy(desc(schema.fileRequest.createdAt))
              .limit(50);
            yield* Effect.annotateCurrentSpan("request.count", rows.length);
            return yield* views(rows);
          }, dieOnDatabaseError),

          open: Effect.fn("FileRequests.open")(function* open(token: string, ip: string) {
            const request = yield* live(token, ip);
            return OpenedRequest.make({
              expiresAt: request.expiresAt,
              instructions: request.instructions,
              ownerName: request.owner.name,
              title: request.title,
            });
          }),

          receive: Effect.fn("FileRequests.receive")(function* receive(
            input: NewRequestUpload,
            ip: string,
          ) {
            const request = yield* live(input.token, ip);
            if (!(yield* rates.uploadsPerIp(ip))) {
              return yield* limited("portalUploadsPerIp");
            }
            return toUpload(yield* deliveries.receive(request, input));
          }),

          sign: Effect.fn("FileRequests.sign")(function* sign(
            token: string,
            ip: string,
            key: string,
            request: UploadRequest,
          ) {
            const row = yield* live(token, ip);
            return yield* transfers.sign(row.ownerId, key, request, row.id);
          }),

          uploads: Effect.fn("FileRequests.uploads")(function* uploads(
            token: string,
            ip: string,
            deliveryIds: readonly DeliveryId[],
          ) {
            const request = yield* live(token, ip);
            const found = yield* deliveries.ofRequest(request.id, deliveryIds);
            return found.map(toUpload);
          }),
        });
      }),
    );
}

import {
  FileRequest,
  OpenedRequest,
  plans,
  RequestFull,
  RequestId,
  RequestNotFound,
  RetentionNotInPlan,
} from "@tranzfer/contracts";
import type {
  Delivery,
  DeliveryConflict,
  DeliveryId,
  DeliveryNotFound,
  DeliveryRefused,
  InvalidUpload,
  LinkToken,
  NewFileRequest,
  NewRequestUpload,
  NotUploaded,
  RateLimited,
  RequestUpload,
  SignedUrl,
  StorageUnavailable,
  TransferId,
  UploadClosed,
  UploadRequest,
  UserId,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import {
  and,
  countDistinct,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Deliveries } from "./deliveries";
import { LinkTokens, newLinkId } from "./link-tokens";
import { Plans } from "./plans";
import { RateLimiter } from "./rate-limiter";
import { Transfers } from "./transfers";

type Row = typeof schema.fileRequest.$inferSelect;

// The uploader sees their own files and their state, never the owner's link.
const toUpload = (delivery: Delivery): RequestUpload => ({
  id: delivery.id,
  status: delivery.status,
  title: delivery.title,
  transfers: delivery.transfers,
});

const statusOf = (row: Row, now: number) => {
  if (row.closedAt !== null) {
    return "closed";
  }
  return row.expiresAt.getTime() <= now ? "expired" : "open";
};

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
      ownerId: UserId,
      input: NewFileRequest,
    ) => Effect.Effect<FileRequest, RetentionNotInPlan>;
    readonly list: (ownerId: UserId) => Effect.Effect<readonly FileRequest[]>;
    /** Ends the request now. Closing again changes nothing. */
    readonly close: (
      ownerId: UserId,
      requestId: RequestId,
    ) => Effect.Effect<FileRequest, RequestNotFound>;
    readonly open: (
      token: LinkToken,
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
      token: LinkToken,
      ip: string,
      key: string,
      request: UploadRequest,
    ) => Effect.Effect<
      SignedUrl,
      DeliveryNotFound | InvalidUpload | RateLimited | RequestNotFound | UploadClosed
    >;
    readonly finalize: (
      token: LinkToken,
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
      token: LinkToken,
      ip: string,
      deliveryIds: readonly DeliveryId[],
    ) => Effect.Effect<readonly RequestUpload[], RateLimited | RequestNotFound>;
  }
>()("tranzfer/FileRequests") {
  static readonly layer = Layer.effect(
    FileRequests,
    Effect.gen(function* makeFileRequests() {
      const { db } = yield* Database;
      const deliveries = yield* Deliveries;
      const tokens = yield* LinkTokens;
      const limiter = yield* RateLimiter;
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
            uploads: countDistinct(schema.delivery.id),
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

      // Bytes in a request's uploads that were not cancelled, as SQL.
      const requestBytes = (requestId: RequestId) =>
        db
          .select({ total: sql<number>`coalesce(sum(${schema.transfer.size}), 0)` })
          .from(schema.transfer)
          .innerJoin(schema.delivery, eq(schema.transfer.deliveryId, schema.delivery.id))
          .where(
            and(eq(schema.delivery.requestId, requestId), ne(schema.delivery.status, "cancelled")),
          );

      // The request is open, unexpired and has room for these bytes. Part of
      // the statement that inserts the delivery, so racing uploads and a close
      // can't slip past it.
      const requestAccepts = (requestId: RequestId, requestedBytes: number, now: number) =>
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.fileRequest)
            .where(
              and(
                eq(schema.fileRequest.id, requestId),
                isNull(schema.fileRequest.closedAt),
                gt(schema.fileRequest.expiresAt, new Date(now)),
                or(
                  isNull(schema.fileRequest.maxBytes),
                  sql`(${requestBytes(requestId)}) + ${requestedBytes} <= ${schema.fileRequest.maxBytes}`,
                ),
              ),
            ),
        );

      // Names why the request refused an upload its statement did not insert.
      const explain = Effect.fn("FileRequests.explain")(function* explain(
        requestId: RequestId,
        requestedBytes: number,
      ) {
        const row = yield* db.query.fileRequest.findFirst({ where: { id: requestId } });
        const now = yield* Clock.currentTimeMillis;
        if (row === undefined || row.closedAt !== null || row.expiresAt.getTime() <= now) {
          return yield* new RequestNotFound();
        }
        const [used] = yield* requestBytes(row.id);
        if (row.maxBytes !== null && (used?.total ?? 0) + requestedBytes > row.maxBytes) {
          return yield* new RequestFull();
        }
      }, dieOnDatabaseError);

      const viewOne = Effect.fn("FileRequests.viewOne")(function* viewOne(row: Row) {
        const [view] = yield* views([row]);
        return view ?? (yield* Effect.die(new Error(`Request ${row.id} has no view`)));
      });

      // The one gate for every uploader call: the caller's IP is counted
      // first, so floods of bad tokens are limited too, then the token must
      // verify and name a request that is open and unexpired, then the
      // request is counted.
      const live = Effect.fn("FileRequests.live")(function* live(token: LinkToken, ip: string) {
        yield* limiter.check("portalCallsPerIp", ip);
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
        yield* limiter.check("portalCallsPerRequest", row.id);
        return row;
      }, dieOnDatabaseError);

      return FileRequests.of({
        close: Effect.fn("FileRequests.close")(function* close(
          ownerId: UserId,
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
          ownerId: UserId,
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
          token: LinkToken,
          ip: string,
          transferId: TransferId,
        ) {
          const request = yield* live(token, ip);
          yield* Effect.annotateCurrentSpan("request.id", request.id);
          return toUpload(yield* transfers.finalize(request.ownerId, transferId, request.id));
        }),

        list: Effect.fn("FileRequests.list")(function* list(ownerId: UserId) {
          const rows = yield* db
            .select()
            .from(schema.fileRequest)
            .where(eq(schema.fileRequest.ownerId, ownerId))
            .orderBy(desc(schema.fileRequest.createdAt))
            .limit(50);
          yield* Effect.annotateCurrentSpan("request.count", rows.length);
          return yield* views(rows);
        }, dieOnDatabaseError),

        open: Effect.fn("FileRequests.open")(function* open(token: LinkToken, ip: string) {
          const request = yield* live(token, ip);
          yield* Effect.annotateCurrentSpan("request.id", request.id);
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
          yield* Effect.annotateCurrentSpan({
            "delivery.file_count": input.files.length,
            "delivery.id": input.id,
            "delivery.total_bytes": input.files.reduce((total, file) => total + file.size, 0),
            "request.id": request.id,
          });
          yield* limiter.check("portalUploadsPerIp", ip);
          // The upload belongs to the request's owner and counts against their
          // plan, which may have dropped since the request was made.
          const { plan } = yield* userPlans.current(request.ownerId);
          const delivery = yield* deliveries
            .place(
              request.ownerId,
              plan,
              {
                files: input.files,
                id: input.id,
                retentionDays:
                  request.retentionDays <= plans[plan].maxRetentionDays
                    ? request.retentionDays
                    : plans[plan].maxRetentionDays,
                title: `${request.title} from ${input.name}`,
              },
              {
                condition: (requestedBytes, now) => requestAccepts(request.id, requestedBytes, now),
                explain: (requestedBytes) => explain(request.id, requestedBytes),
                origin: {
                  requestId: request.id,
                  uploaderEmail: input.email,
                  uploaderName: input.name,
                },
              },
            )
            .pipe(
              // The uploader is told there is no room, not how big the owner's plan is.
              Effect.catchTag("OverPlanLimit", () => Effect.fail(new RequestFull())),
            );
          return toUpload(delivery);
        }),

        sign: Effect.fn("FileRequests.sign")(function* sign(
          token: LinkToken,
          ip: string,
          key: string,
          request: UploadRequest,
        ) {
          const row = yield* live(token, ip);
          yield* Effect.annotateCurrentSpan("request.id", row.id);
          return yield* transfers.sign(row.ownerId, key, request, row.id);
        }),

        uploads: Effect.fn("FileRequests.uploads")(function* uploads(
          token: LinkToken,
          ip: string,
          deliveryIds: readonly DeliveryId[],
        ) {
          const request = yield* live(token, ip);
          yield* Effect.annotateCurrentSpan("request.id", request.id);
          const found = yield* deliveries.ofRequest(request.id, deliveryIds);
          return found.map(toUpload);
        }),
      });
    }),
  );
}

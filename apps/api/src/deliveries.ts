import {
  checkFiles,
  Delivery,
  DeliveryConflict,
  DeliveryNotFound,
  OverPlanLimit,
  plans,
  RateLimited,
  rateLimits,
  RequestFull,
  RequestNotFound,
  RetentionNotInPlan,
} from "@tranzfer/contracts";
import type {
  DeliveryDownload,
  DeliveryId,
  NewDelivery,
  NewRequestUpload,
  PlanId,
  RequestId,
  RetentionDays,
  DeliveryRefused,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";

import { LinkTokens, newLinkId } from "./link-tokens";
import { hashPassword } from "./passwords";
import { Plans } from "./plans";
import { Storage, UPLOAD_URL_TTL } from "./storage";

// D1 caps a statement at 100 bound parameters and a transfer row binds 8.
const TRANSFER_ROWS_PER_INSERT = 12;
// Deliveries purged per sweep; each is one list plus one bulk delete per 1000 files.
const PURGE_BATCH = 20;
// A Complete or empty-file Put signed before a cancel can still land an object
// until its URL expires, so the confirming purge waits out the URL's lifetime.
const CANCEL_SETTLE = Duration.sum(UPLOAD_URL_TTL, Duration.minutes(1));
/**
 * A delivery has this long to finish uploading. R2 aborts incomplete multipart
 * uploads after 7 days, so the window matches what storage can honor. Signing
 * refuses past it, and the sweeper ends what is still open.
 */
export const UPLOAD_WINDOW = Duration.days(7);

/**
 * Seconds until a rolling window has room again, given the creation times in
 * it newest first, or undefined while it has room. The window is full when
 * its limit-th newest entry is still inside it.
 */
export const secondsUntilRoom = (
  newestFirst: readonly Date[],
  rule: { readonly limit: number; readonly windowSeconds: number },
  now: number,
) => {
  const oldestCounted = newestFirst[rule.limit - 1];
  const reopensAt =
    oldestCounted === undefined ? now : oldestCounted.getTime() + rule.windowSeconds * 1000;
  return reopensAt > now ? Math.ceil((reopensAt - now) / 1000) : undefined;
};

export const objectPrefix = (deliveryId: DeliveryId) => `d/${deliveryId}/`;

// How many deliveries the sender created after `since`, as SQL.
const createdSince = (senderId: string, since: number) =>
  sql`(select count(*) from ${schema.delivery} where ${and(
    eq(schema.delivery.senderId, senderId),
    gt(schema.delivery.createdAt, new Date(since)),
  )})`;

export const isExpired = (expiresAt: Date | null, now: number) =>
  expiresAt !== null && expiresAt.getTime() <= now;

/** Where a delivery came from: nowhere special, or an uploader through a file request. */
interface Origin {
  readonly requestId: RequestId | null;
  readonly uploaderEmail: string | null;
  readonly uploaderName: string | null;
}
const direct: Origin = { requestId: null, uploaderEmail: null, uploaderName: null };

/**
 * An upload through a file request. `explain` runs when the delivery's
 * statement inserted nothing and the owner's own limits do not explain it. It
 * fails with why the request refused, or succeeds when nothing it can name did.
 */
interface Intake<E> {
  readonly origin: {
    readonly requestId: RequestId;
    readonly uploaderEmail: string | null;
    readonly uploaderName: string;
  };
  readonly explain: (requestedBytes: number) => Effect.Effect<void, E>;
}

// A retried create replays only when every field matches.
const sameDelivery = (
  senderId: string,
  input: NewDelivery,
  origin: Origin,
  row: typeof schema.delivery.$inferSelect & {
    readonly transfers: readonly (typeof schema.transfer.$inferSelect)[];
  },
) =>
  row.senderId === senderId &&
  row.requestId === origin.requestId &&
  row.uploaderName === origin.uploaderName &&
  row.uploaderEmail === origin.uploaderEmail &&
  row.retentionDays === input.retentionDays &&
  row.title === input.title &&
  row.transfers.length === input.files.length &&
  input.files.every((file) =>
    row.transfers.some(
      (transfer) =>
        transfer.id === file.id &&
        transfer.path === file.path &&
        transfer.size === file.size &&
        transfer.contentType === file.contentType &&
        transfer.sourceModifiedAt.getTime() === file.lastModified,
    ),
  );

/** Delivery lifecycle for its sender, plus the purge of what ended. */
export class Deliveries extends Context.Service<
  Deliveries,
  {
    readonly create: (
      senderId: string,
      input: NewDelivery,
    ) => Effect.Effect<
      Delivery,
      DeliveryConflict | DeliveryRefused | OverPlanLimit | RateLimited | RetentionNotInPlan
    >;
    /** Bytes of the sender's deliveries that are open, or ready and not yet expired. */
    readonly activeBytes: (senderId: string) => Effect.Effect<number>;
    readonly list: (senderId: string) => Effect.Effect<readonly Delivery[]>;
    /** Stops signing, kills the link, aborts uploads and removes the objects; the sweeper confirms later. */
    readonly cancel: (
      senderId: string,
      deliveryId: DeliveryId,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    /** The sender's own delivery as the dashboard shows it, whatever its status. */
    readonly owned: (
      senderId: string,
      deliveryId: DeliveryId,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    /** Takes the sender's ended deliveries among these off their list; live ones stay. */
    readonly clear: (senderId: string, deliveryIds: readonly DeliveryId[]) => Effect.Effect<void>;
    /** Replaces the title and note of the sender's own delivery, whatever its status. */
    readonly update: (
      senderId: string,
      deliveryId: DeliveryId,
      details: { readonly note: string; readonly title: string },
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    /**
     * Creates the delivery for an upload through a file request. It belongs to
     * the request's owner and counts against their plan, and the request's own
     * limits are part of the statement that inserts it. The caller has checked
     * the request is live; `RequestNotFound` here is a close or expiry that
     * landed in between.
     */
    readonly receive: (
      request: typeof schema.fileRequest.$inferSelect,
      input: NewRequestUpload,
    ) => Effect.Effect<
      Delivery,
      DeliveryConflict | DeliveryRefused | RateLimited | RequestFull | RequestNotFound
    >;
    /** The deliveries among these ids that came in through the request. */
    readonly ofRequest: (
      requestId: RequestId,
      deliveryIds: readonly DeliveryId[],
    ) => Effect.Effect<readonly Delivery[]>;
    /** Sets, replaces or (with null) removes the password on the sender's own delivery's link. */
    readonly setPassword: (
      senderId: string,
      deliveryId: DeliveryId,
      password: string | null,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    readonly view: (deliveryId: DeliveryId) => Effect.Effect<Delivery>;
    /** Removes the objects of cancelled and expired deliveries. Returns how many it purged. */
    readonly purgeEnded: Effect.Effect<number>;
  }
>()("tranzfer/Deliveries") {
  static readonly layer = Layer.effect(
    Deliveries,
    Effect.gen(function* makeDeliveries() {
      const { batch, db } = yield* Database;
      const userPlans = yield* Plans;
      const tokens = yield* LinkTokens;
      const storage = yield* Storage;

      const load = (deliveryId: DeliveryId) =>
        db.query.delivery.findFirst({
          where: { id: deliveryId },
          with: { link: true, transfers: { orderBy: { path: "asc" } } },
        });
      type Row = NonNullable<Effect.Success<ReturnType<typeof load>>>;

      // What recipients reported, per delivery; one with no reports has no entry.
      const downloadsOf = Effect.fn("Deliveries.downloads")(function* downloadsOf(
        ids: readonly DeliveryId[],
      ) {
        const rows = yield* db
          .select({
            deliveryId: schema.download.deliveryId,
            filesSaved: sql<number>`count(${schema.download.savedAt})`,
            lastAt: sql<number>`max(${schema.download.lastAt})`,
            startedAt: sql<number>`min(${schema.download.startedAt})`,
          })
          .from(schema.download)
          .where(inArray(schema.download.deliveryId, ids))
          .groupBy(schema.download.deliveryId);
        return new Map(
          rows.map((row) => [
            row.deliveryId,
            {
              filesSaved: row.filesSaved,
              lastAt: new Date(row.lastAt),
              startedAt: new Date(row.startedAt),
            } satisfies DeliveryDownload,
          ]),
        );
      });

      const toView = Effect.fn("Deliveries.toView")(function* toView(
        row: Row,
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

      const markPurged = (deliveryId: DeliveryId) =>
        Effect.flatMap(Clock.currentTimeMillis, (now) =>
          db

            .update(schema.delivery)

            .set({ purgedAt: new Date(now) })

            .where(eq(schema.delivery.id, deliveryId)),
        );

      const removeObjects = (deliveryId: DeliveryId, objectKeys: readonly string[]) =>
        storage.purge(objectPrefix(deliveryId), objectKeys).pipe(
          Effect.as(true),
          Effect.catchTag("StorageError", (error) =>
            Effect.logError("purge failed", { deliveryId }, error.cause).pipe(Effect.as(false)),
          ),
        );

      const viewRow = Effect.fn("Deliveries.viewRow")(function* viewRow(row: Row) {
        const downloads = yield* downloadsOf([row.id]);
        return yield* toView(row, downloads.get(row.id) ?? null);
      });

      const view = Effect.fn("Deliveries.view")(function* view(deliveryId: DeliveryId) {
        yield* Effect.annotateCurrentSpan("delivery.id", deliveryId);
        const row = yield* load(deliveryId);
        if (row === undefined) {
          return yield* Effect.die(new Error(`Delivery ${deliveryId} vanished`));
        }
        return yield* viewRow(row);
      }, dieOnDatabaseError);

      const activeBytesAt = (senderId: string, now: number) =>
        db
          .select({ total: sql<number>`coalesce(sum(${schema.transfer.size}), 0)` })
          .from(schema.transfer)
          .innerJoin(schema.delivery, eq(schema.transfer.deliveryId, schema.delivery.id))
          .where(
            and(
              eq(schema.delivery.senderId, senderId),
              or(
                eq(schema.delivery.status, "open"),
                and(
                  eq(schema.delivery.status, "ready"),
                  gt(schema.delivery.expiresAt, new Date(now)),
                ),
              ),
            ),
          );

      const activeBytes = Effect.fn("Deliveries.activeBytes")(function* activeBytes(
        senderId: string,
      ) {
        const [row] = yield* activeBytesAt(senderId, yield* Clock.currentTimeMillis);
        return row?.total ?? 0;
      }, dieOnDatabaseError);

      // Refused before any bytes upload, with the exact wait or the space in
      // use; else the sender's active bytes. Cancelled deliveries count
      // toward the Free caps, so create-and-cancel can't loop.
      const admit = Effect.fn("Deliveries.admit")(function* admit(
        senderId: string,
        plan: PlanId,
        requestedBytes: number,
        now: number,
      ) {
        if (plan === "free") {
          const { deliveriesPerDay } = rateLimits;
          const recent = yield* db
            .select({ createdAt: schema.delivery.createdAt })
            .from(schema.delivery)
            .where(
              and(
                eq(schema.delivery.senderId, senderId),
                gt(
                  schema.delivery.createdAt,
                  new Date(now - deliveriesPerDay.windowSeconds * 1000),
                ),
              ),
            )
            .orderBy(desc(schema.delivery.createdAt))
            .limit(deliveriesPerDay.limit);
          const createdAt = recent.map((row) => row.createdAt);
          for (const limit of ["deliveriesPerHour", "deliveriesPerDay"] as const) {
            const retryAfterSeconds = secondsUntilRoom(createdAt, rateLimits[limit], now);
            if (retryAfterSeconds !== undefined) {
              return yield* new RateLimited({ limit, retryAfterSeconds });
            }
          }
        }
        const usedBytes = yield* activeBytes(senderId);
        if (usedBytes + requestedBytes <= plans[plan].activeBytes) {
          return usedBytes;
        }
        return yield* new OverPlanLimit({
          limitBytes: plans[plan].activeBytes,
          plan,
          requestedBytes,
          usedBytes,
        });
      });

      // The same rules as `admit`, checked by the statement that inserts the
      // delivery, so they hold when creates race.
      const withinLimits = (senderId: string, plan: PlanId, requestedBytes: number, now: number) =>
        and(
          sql`(${activeBytesAt(senderId, now)}) + ${requestedBytes} <= ${plans[plan].activeBytes}`,
          ...(plan === "free"
            ? (["deliveriesPerHour", "deliveriesPerDay"] as const).map((limit) =>
                lt(
                  createdSince(senderId, now - rateLimits[limit].windowSeconds * 1000),
                  rateLimits[limit].limit,
                ),
              )
            : []),
        );

      // A retried create finds its delivery again: the same one back, or a
      // conflict when the id belongs to different content.
      const replay = Effect.fn("Deliveries.replay")(function* replay(
        senderId: string,
        input: NewDelivery,
        origin: Origin,
      ) {
        const existing = yield* load(input.id);
        if (existing === undefined) {
          return Option.none();
        }
        yield* Effect.annotateCurrentSpan("delivery.replayed", true);
        return sameDelivery(senderId, input, origin, existing)
          ? Option.some(yield* viewRow(existing))
          : yield* new DeliveryConflict();
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
        sql`exists (select 1 from ${schema.fileRequest} where ${and(
          eq(schema.fileRequest.id, requestId),
          isNull(schema.fileRequest.closedAt),
          gt(schema.fileRequest.expiresAt, new Date(now)),
          or(
            isNull(schema.fileRequest.maxBytes),
            sql`(${requestBytes(requestId)}) + ${requestedBytes} <= ${schema.fileRequest.maxBytes}`,
          ),
        )})`;

      // Everything create and receive share once the owner, title and
      // retention are settled: admit, insert atomically, and name a refusal.
      const place = <E = never>(
        senderId: string,
        plan: PlanId,
        input: NewDelivery,
        intake?: Intake<E>,
      ) =>
        Effect.gen(function* insertDelivery() {
          const origin = intake?.origin ?? direct;
          const now = yield* Clock.currentTimeMillis;
          const requestedBytes = input.files.reduce((total, file) => total + file.size, 0);
          yield* admit(senderId, plan, requestedBytes, now);

          const linkId = yield* newLinkId;
          const inserted = yield* Effect.result(
            batch([
              // Inserts the delivery only while the sender is still within
              // its limits, counted by this statement. When it inserts
              // nothing, the transfers' and link's foreign keys fail the batch
              // and nothing lands.
              db.insert(schema.delivery).select((qb) =>
                qb
                  .select({
                    id: sql<DeliveryId>`${input.id}`.as("id"),
                    requestId: sql<RequestId | null>`${origin.requestId}`.as("request_id"),
                    retentionDays: sql<RetentionDays>`${input.retentionDays}`.as("retention_days"),
                    senderId: schema.user.id,
                    title: sql<string>`${input.title}`.as("title"),
                    uploaderEmail: sql<string | null>`${origin.uploaderEmail}`.as("uploader_email"),
                    uploaderName: sql<string | null>`${origin.uploaderName}`.as("uploader_name"),
                  })
                  .from(schema.user)
                  .where(
                    and(
                      eq(schema.user.id, senderId),
                      withinLimits(senderId, plan, requestedBytes, now),
                      origin.requestId === null
                        ? undefined
                        : requestAccepts(origin.requestId, requestedBytes, now),
                    ),
                  ),
              ),
              ...Arr.chunksOf(input.files, TRANSFER_ROWS_PER_INSERT).map((files) =>
                db.insert(schema.transfer).values(
                  files.map((file) => ({
                    contentType: file.contentType,
                    deliveryId: input.id,
                    id: file.id,
                    objectKey: `${objectPrefix(input.id)}${file.id}`,
                    path: file.path,
                    size: file.size,
                    sourceModifiedAt: new Date(file.lastModified),
                  })),
                ),
              ),
              db.insert(schema.link).values({ deliveryId: input.id, id: linkId }),
            ]),
          );
          if (inserted._tag === "Success") {
            return yield* view(input.id);
          }

          // The batch lost a race, hit a taken transfer id or found the
          // sender over a limit: decide from what landed.
          const landed = yield* load(input.id);
          // One JSON parameter instead of one per id keeps this under D1's cap.
          const taken = yield* db
            .select({ id: schema.transfer.id })
            .from(schema.transfer)
            .where(
              inArray(
                schema.transfer.id,
                sql`(select value from json_each(${JSON.stringify(input.files.map((file) => file.id))}))`,
              ),
            )
            .limit(1);
          return yield* Match.value({ landed, taken: taken.length > 0 }).pipe(
            Match.when(
              {
                landed: (row) => row !== undefined && sameDelivery(senderId, input, origin, row),
              },
              () => view(input.id),
            ),
            Match.whenOr({ landed: (row) => row !== undefined }, { taken: true }, () =>
              Effect.fail(new DeliveryConflict()),
            ),
            // A limit a concurrent create filled names the refusal; nothing
            // naming it means the request refused, or a real database fault.
            Match.orElse(() =>
              admit(senderId, plan, requestedBytes, now).pipe(
                Effect.andThen(intake?.explain(requestedBytes) ?? Effect.void),
                Effect.andThen(Effect.die(inserted.failure)),
              ),
            ),
          );
        }).pipe(Effect.withSpan("Deliveries.place"));

      return Deliveries.of({
        activeBytes,
        cancel: Effect.fn("Deliveries.cancel")(function* cancel(
          senderId: string,
          deliveryId: DeliveryId,
        ) {
          const row = yield* load(deliveryId);
          if (row === undefined || row.senderId !== senderId) {
            return yield* new DeliveryNotFound();
          }
          yield* Effect.annotateCurrentSpan({
            "delivery.file_count": row.transfers.length,
            "delivery.id": deliveryId,
            "delivery.status": row.status,
          });
          yield* batch([
            db
              .update(schema.delivery)
              .set({ status: "cancelled" })
              .where(eq(schema.delivery.id, deliveryId)),
            db
              .update(schema.transfer)
              .set({ state: "cancelled" })
              .where(eq(schema.transfer.deliveryId, deliveryId)),
          ]);
          yield* removeObjects(
            deliveryId,

            row.transfers.map((transfer) => transfer.objectKey),
          );
          return yield* view(deliveryId);
        }, dieOnDatabaseError),
        clear: Effect.fn("Deliveries.clear")(function* clear(
          senderId: string,
          deliveryIds: readonly DeliveryId[],
        ) {
          yield* Effect.annotateCurrentSpan("delivery.count", deliveryIds.length);
          if (deliveryIds.length === 0) {
            return;
          }
          const now = new Date(yield* Clock.currentTimeMillis);
          yield* db
            .update(schema.delivery)
            .set({ clearedAt: now })
            .where(
              and(
                eq(schema.delivery.senderId, senderId),
                inArray(schema.delivery.id, deliveryIds),
                isNull(schema.delivery.clearedAt),
                or(
                  eq(schema.delivery.status, "cancelled"),
                  and(eq(schema.delivery.status, "ready"), lte(schema.delivery.expiresAt, now)),
                ),
              ),
            );
        }, dieOnDatabaseError),
        create: Effect.fn("Deliveries.create")(function* create(
          senderId: string,
          input: NewDelivery,
        ) {
          yield* Effect.annotateCurrentSpan({
            "delivery.file_count": input.files.length,
            "delivery.id": input.id,
            "delivery.retention_days": input.retentionDays,
            "delivery.total_bytes": input.files.reduce((total, file) => total + file.size, 0),
          });
          const replayed = yield* replay(senderId, input, direct);
          if (Option.isSome(replayed)) {
            return replayed.value;
          }
          yield* checkFiles(input.files);

          const { plan } = yield* userPlans.current(senderId);
          if (input.retentionDays > plans[plan].maxRetentionDays) {
            return yield* new RetentionNotInPlan({
              maxRetentionDays: plans[plan].maxRetentionDays,
              plan,
              requestedDays: input.retentionDays,
            });
          }
          return yield* place(senderId, plan, input);
        }, dieOnDatabaseError),
        list: Effect.fn("Deliveries.list")(function* list(senderId: string) {
          const rows = yield* db.query.delivery.findMany({
            limit: 50,
            orderBy: { createdAt: "desc" },
            where: { clearedAt: { isNull: true }, senderId },
            with: { link: true, transfers: { orderBy: { path: "asc" } } },
          });
          yield* Effect.annotateCurrentSpan("delivery.count", rows.length);
          const downloads = yield* downloadsOf(rows.map((row) => row.id));
          return yield* Effect.forEach(rows, (row) => toView(row, downloads.get(row.id) ?? null));
        }, dieOnDatabaseError),

        ofRequest: Effect.fn("Deliveries.ofRequest")(function* ofRequest(
          requestId: RequestId,
          deliveryIds: readonly DeliveryId[],
        ) {
          if (deliveryIds.length === 0) {
            return [];
          }
          const rows = yield* db.query.delivery.findMany({
            where: { id: { in: [...deliveryIds] }, requestId },
            with: { link: true, transfers: { orderBy: { path: "asc" } } },
          });
          return yield* Effect.forEach(rows, (row) => toView(row, null));
        }, dieOnDatabaseError),

        owned: Effect.fn("Deliveries.owned")(function* owned(
          senderId: string,
          deliveryId: DeliveryId,
        ) {
          const row = yield* load(deliveryId);
          if (row === undefined || row.senderId !== senderId) {
            return yield* new DeliveryNotFound();
          }
          return yield* viewRow(row);
        }, dieOnDatabaseError),

        purgeEnded: Effect.gen(function* purgeEnded() {
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
                    sql`EXISTS (SELECT 1 FROM delivery WHERE delivery.id = transfer.delivery_id AND delivery.status = 'cancelled')`,
                  ),
                ),
            ]);
            yield* Effect.logInfo("abandoned deliveries cancelled", { count: ids.length });
          }
          yield* Effect.annotateCurrentSpan("sweep.abandoned", abandoned.length);
          const ended = yield* db.query.delivery.findMany({
            columns: { id: true },
            limit: PURGE_BATCH,
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
          const purged = yield* Effect.forEach(
            ended,
            (delivery) =>
              removeObjects(
                delivery.id,
                delivery.transfers.map((transfer) => transfer.objectKey),
              ).pipe(Effect.tap((removed) => (removed ? markPurged(delivery.id) : Effect.void))),
            { concurrency: 4 },
          );
          const total = purged.filter(Boolean).length;
          yield* Effect.annotateCurrentSpan({ "sweep.ended": ended.length, "sweep.purged": total });
          return total;
        }).pipe(Effect.withSpan("Deliveries.purgeEnded"), dieOnDatabaseError),

        receive: Effect.fn("Deliveries.receive")(function* receive(
          request: typeof schema.fileRequest.$inferSelect,
          input: NewRequestUpload,
        ) {
          yield* Effect.annotateCurrentSpan({
            "delivery.file_count": input.files.length,
            "delivery.id": input.id,
            "delivery.total_bytes": input.files.reduce((total, file) => total + file.size, 0),
            "request.id": request.id,
          });
          const { ownerId } = request;
          const { plan } = yield* userPlans.current(ownerId);
          // The owner's plan may have dropped since the request was made.
          const retentionDays =
            request.retentionDays <= plans[plan].maxRetentionDays
              ? request.retentionDays
              : plans[plan].maxRetentionDays;
          const delivery = {
            files: input.files,
            id: input.id,
            retentionDays,
            title: `${request.title} from ${input.name}`,
          };
          const origin = {
            requestId: request.id,
            uploaderEmail: input.email,
            uploaderName: input.name,
          };
          const replayed = yield* replay(ownerId, delivery, origin);
          if (Option.isSome(replayed)) {
            return replayed.value;
          }
          yield* checkFiles(input.files);
          return yield* place(ownerId, plan, delivery, {
            explain: Effect.fn("Deliveries.explain")(function* explain(requestedBytes: number) {
              const row = yield* db.query.fileRequest.findFirst({ where: { id: request.id } });
              const now = yield* Clock.currentTimeMillis;
              if (row === undefined || row.closedAt !== null || row.expiresAt.getTime() <= now) {
                return yield* new RequestNotFound();
              }
              const [used] = yield* requestBytes(row.id);
              if (row.maxBytes !== null && (used?.total ?? 0) + requestedBytes > row.maxBytes) {
                return yield* new RequestFull();
              }
              return yield* Effect.void;
            }),
            origin,
          }).pipe(
            // The uploader is told there is no room, not how big the owner's plan is.
            Effect.catchTag("OverPlanLimit", () => Effect.fail(new RequestFull())),
          );
        }, dieOnDatabaseError),

        setPassword: Effect.fn("Deliveries.setPassword")(function* setPassword(
          senderId: string,
          deliveryId: DeliveryId,
          password: string | null,
        ) {
          yield* Effect.annotateCurrentSpan("delivery.id", deliveryId);
          const passwordHash = password === null ? null : yield* hashPassword(password);
          // The sender check is part of the statement, as in `update`.
          const changed = yield* db
            .update(schema.link)
            .set({ passwordHash })
            .where(
              and(
                eq(schema.link.deliveryId, deliveryId),
                sql`EXISTS (SELECT 1 FROM delivery WHERE delivery.id = link.delivery_id AND delivery.sender_id = ${senderId})`,
              ),
            )
            .returning({ id: schema.link.id });
          if (changed.length === 0) {
            return yield* new DeliveryNotFound();
          }
          return yield* view(deliveryId);
        }, dieOnDatabaseError),
        update: Effect.fn("Deliveries.update")(function* update(
          senderId: string,
          deliveryId: DeliveryId,
          details: { readonly note: string; readonly title: string },
        ) {
          yield* Effect.annotateCurrentSpan("delivery.id", deliveryId);
          // The sender check is part of the statement, so a foreign or missing
          // id updates nothing and reads the same.
          const updated = yield* db
            .update(schema.delivery)
            .set({ note: details.note, title: details.title })
            .where(and(eq(schema.delivery.id, deliveryId), eq(schema.delivery.senderId, senderId)))
            .returning({ id: schema.delivery.id });
          if (updated.length === 0) {
            return yield* new DeliveryNotFound();
          }
          return yield* view(deliveryId);
        }, dieOnDatabaseError),
        view,
      });
    }),
  );
}

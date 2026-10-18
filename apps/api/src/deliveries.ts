import {
  checkFiles,
  DeliveryConflict,
  DeliveryNotFound,
  OverPlanLimit,
  plans,
  RateLimited,
  rateLimits,
  RetentionNotInPlan,
} from "@tranzfer/contracts";
import type {
  Delivery,
  DeliveryId,
  DeliveryRefused,
  NewDelivery,
  PlanId,
  RequestId,
  RetentionDays,
  UserId,
} from "@tranzfer/contracts";
import { Database, databaseFault, dieOnDatabaseError, schema } from "@tranzfer/db";
import {
  and,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import { makeDeliveryViews } from "./delivery-views";
import { newLinkId } from "./link-tokens";
import { hashPassword } from "./passwords";
import { secondsUntilRoom } from "./attempts";
import { Plans } from "./plans";
import { Storage } from "./storage";

// D1 caps a statement at 100 bound parameters and a transfer row binds 8.
const TRANSFER_ROWS_PER_INSERT = 12;
/**
 * A delivery has this long to finish uploading. R2 aborts incomplete multipart
 * uploads after 7 days, so the window matches what storage can honor. Signing
 * refuses past it, and the sweeper ends what is still open.
 */
export const UPLOAD_WINDOW = Duration.days(7);

export const objectPrefix = (deliveryId: DeliveryId) => `d/${deliveryId}/`;

/** Removes a delivery's objects. A storage failure is logged and reads as false. */
export const removeObjects = (deliveryId: DeliveryId, objectKeys: readonly string[]) =>
  Effect.flatMap(Effect.service(Storage), (storage) =>
    storage.purge(objectPrefix(deliveryId), objectKeys),
  ).pipe(
    Effect.as(true),
    Effect.catchTag("StorageError", (error) =>
      Effect.logError("purge failed", { deliveryId }, error.cause).pipe(Effect.as(false)),
    ),
  );

/** Where a delivery came from: nowhere special, or an uploader through a file request. */
interface Origin {
  readonly requestId: RequestId | null;
  readonly uploaderEmail: string | null;
  readonly uploaderName: string | null;
}
const direct: Origin = { requestId: null, uploaderEmail: null, uploaderName: null };

/**
 * An upload through a file request. `condition` joins the statement that
 * inserts the delivery, so the request's own rules hold when uploads race.
 * `explain` runs when that statement inserted nothing and the owner's own
 * limits do not explain it. It fails with why the request refused, or succeeds
 * when nothing it can name did.
 */
export interface Intake<E> {
  readonly origin: {
    readonly requestId: RequestId;
    readonly uploaderEmail: string | null;
    readonly uploaderName: string;
  };
  readonly condition: (requestedBytes: number, now: number) => SQL;
  readonly explain: (requestedBytes: number) => Effect.Effect<void, E>;
}

// A retried create replays only when every field matches.
const sameDelivery = (
  senderId: UserId,
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

/** Delivery lifecycle for its sender. The sweeper purges what ended (`purge.ts`). */
export class Deliveries extends Context.Service<
  Deliveries,
  {
    readonly create: (
      senderId: UserId,
      input: NewDelivery,
    ) => Effect.Effect<
      Delivery,
      DeliveryConflict | DeliveryRefused | OverPlanLimit | RateLimited | RetentionNotInPlan
    >;
    /** Bytes of the sender's deliveries that are open, or ready and not yet expired. */
    readonly activeBytes: (senderId: UserId) => Effect.Effect<number>;
    readonly list: (senderId: UserId) => Effect.Effect<readonly Delivery[]>;
    /** Stops signing, kills the link, aborts uploads and removes the objects; the sweeper confirms later. */
    readonly cancel: (
      senderId: UserId,
      deliveryId: DeliveryId,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    /** The sender's own delivery as the dashboard shows it, whatever its status. */
    readonly owned: (
      senderId: UserId,
      deliveryId: DeliveryId,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    /** Takes the sender's ended deliveries among these off their list; live ones stay. */
    readonly clear: (senderId: UserId, deliveryIds: readonly DeliveryId[]) => Effect.Effect<void>;
    /** Replaces the title and note of the sender's own delivery, whatever its status. */
    readonly update: (
      senderId: UserId,
      deliveryId: DeliveryId,
      details: { readonly note: string; readonly title: string },
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    /**
     * Creates the delivery under a plan the caller settled: replays a retried
     * create, then inserts it in one statement that checks the sender's
     * limits and the intake's condition, and names the refusal when it loses.
     */
    readonly place: <E = never>(
      senderId: UserId,
      plan: PlanId,
      input: NewDelivery,
      intake?: Intake<E>,
    ) => Effect.Effect<
      Delivery,
      DeliveryConflict | DeliveryRefused | OverPlanLimit | RateLimited | E
    >;
    /** The deliveries among these ids that came in through the request. */
    readonly ofRequest: (
      requestId: RequestId,
      deliveryIds: readonly DeliveryId[],
    ) => Effect.Effect<readonly Delivery[]>;
    /** Sets, replaces or (with null) removes the password on the sender's own delivery's link. */
    readonly setPassword: (
      senderId: UserId,
      deliveryId: DeliveryId,
      password: string | null,
    ) => Effect.Effect<Delivery, DeliveryNotFound>;
    readonly view: (deliveryId: DeliveryId) => Effect.Effect<Delivery>;
  }
>()("tranzfer/Deliveries") {
  static readonly layer = Layer.effect(
    Deliveries,
    Effect.gen(function* makeDeliveries() {
      const { batch, db } = yield* Database;
      const userPlans = yield* Plans;
      const storage = yield* Storage;
      const { downloadsOf, load, toView, view, viewRow } = yield* makeDeliveryViews;

      const activeBytesAt = (senderId: UserId, now: number) =>
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
        senderId: UserId,
      ) {
        const [row] = yield* activeBytesAt(senderId, yield* Clock.currentTimeMillis);
        return row?.total ?? 0;
      }, dieOnDatabaseError);

      // Refused before any bytes upload, with the exact wait or the space in
      // use; else the sender's active bytes. Cancelled deliveries count
      // toward the Free caps, so create-and-cancel can't loop.
      const admit = Effect.fn("Deliveries.admit")(function* admit(
        senderId: UserId,
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
      const withinLimits = (senderId: UserId, plan: PlanId, requestedBytes: number, now: number) =>
        and(
          sql`(${activeBytesAt(senderId, now)}) + ${requestedBytes} <= ${plans[plan].activeBytes}`,
          ...(plan === "free"
            ? (["deliveriesPerHour", "deliveriesPerDay"] as const).map((limit) =>
                lt(
                  // The sender's deliveries created inside the window.
                  db.$count(
                    schema.delivery,
                    and(
                      eq(schema.delivery.senderId, senderId),
                      gt(
                        schema.delivery.createdAt,
                        new Date(now - rateLimits[limit].windowSeconds * 1000),
                      ),
                    ),
                  ),
                  rateLimits[limit].limit,
                ),
              )
            : []),
        );

      // A retried create finds its delivery again: the same one back, or a
      // conflict when the id belongs to different content.
      const replay = Effect.fn("Deliveries.replay")(function* replay(
        senderId: UserId,
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

      // Everything create and place share once the owner, title and
      // retention are settled: admit, insert atomically, and name a refusal.
      const insert = <E = never>(
        senderId: UserId,
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
                      intake?.condition(requestedBytes, now),
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
          if (Result.isSuccess(inserted)) {
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
                Effect.andThen(databaseFault(inserted.failure)),
              ),
            ),
          );
        }).pipe(Effect.withSpan("Deliveries.insert"));

      return Deliveries.of({
        activeBytes,
        cancel: Effect.fn("Deliveries.cancel")(function* cancel(
          senderId: UserId,
          deliveryId: DeliveryId,
        ) {
          yield* Effect.annotateCurrentSpan("delivery.id", deliveryId);
          const row = yield* load(deliveryId);
          if (row === undefined || row.senderId !== senderId) {
            return yield* new DeliveryNotFound();
          }
          yield* Effect.annotateCurrentSpan({
            "delivery.file_count": row.transfers.length,
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
          ).pipe(Effect.provideService(Storage, storage));
          return yield* view(deliveryId);
        }, dieOnDatabaseError),
        clear: Effect.fn("Deliveries.clear")(function* clear(
          senderId: UserId,
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
          senderId: UserId,
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
          return yield* insert(senderId, plan, input);
        }, dieOnDatabaseError),
        list: Effect.fn("Deliveries.list")(function* list(senderId: UserId) {
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
          senderId: UserId,
          deliveryId: DeliveryId,
        ) {
          yield* Effect.annotateCurrentSpan("delivery.id", deliveryId);
          const row = yield* load(deliveryId);
          if (row === undefined || row.senderId !== senderId) {
            return yield* new DeliveryNotFound();
          }
          return yield* viewRow(row);
        }, dieOnDatabaseError),

        place: <E = never>(
          senderId: UserId,
          plan: PlanId,
          input: NewDelivery,
          intake?: Intake<E>,
        ) =>
          Effect.gen(function* place() {
            const replayed = yield* replay(senderId, input, intake?.origin ?? direct);
            if (Option.isSome(replayed)) {
              return replayed.value;
            }
            yield* checkFiles(input.files);
            return yield* insert(senderId, plan, input, intake);
          }).pipe(Effect.withSpan("Deliveries.place"), dieOnDatabaseError),

        setPassword: Effect.fn("Deliveries.setPassword")(function* setPassword(
          senderId: UserId,
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
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(schema.delivery)
                    .where(
                      and(
                        eq(schema.delivery.id, schema.link.deliveryId),
                        eq(schema.delivery.senderId, senderId),
                      ),
                    ),
                ),
              ),
            )
            .returning({ id: schema.link.id });
          if (changed.length === 0) {
            return yield* new DeliveryNotFound();
          }
          return yield* view(deliveryId);
        }, dieOnDatabaseError),
        update: Effect.fn("Deliveries.update")(function* update(
          senderId: UserId,
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

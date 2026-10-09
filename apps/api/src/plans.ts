import {
  AccessCodeRefused,
  PaidPlanId,
  PlanId,
  RateLimited,
  rateLimits,
} from "@tranzfer/contracts";
import type { PlanGrant } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

const rank = (plan: PlanId) => PlanId.literals.indexOf(plan);

// The database's clock, in the integer milliseconds every timestamp column
// holds. A revoke stamps it, and a redemption's write compares against it, so
// a redemption can't commit after a revoke that landed first.
const databaseNow = sql`cast(unixepoch('subsecond') * 1000 as integer)`;

// A code is over at `now` by the request's clock or by the database's.
const latest = (now: number) => sql`max(${now}, ${databaseNow})`;

/** A calendar day like 2026-12-31, as its UTC midnight. A day that doesn't exist fails. */
const Day = Schema.String.check(
  Schema.makeFilter(
    (day: string) => {
      const time = Date.parse(`${day}T00:00:00Z`);
      // Date.parse rolls 2026-02-30 over to March 2; the round trip catches it.
      return (
        /^\d{4}-\d{2}-\d{2}$/u.test(day) &&
        !Number.isNaN(time) &&
        new Date(time).toISOString().startsWith(day)
      );
    },
    { expected: "a real day like 2026-12-31" },
  ),
).pipe(
  Schema.decodeTo(
    Schema.Date,
    SchemaTransformation.transform({
      decode: (day) => new Date(`${day}T00:00:00Z`),
      encode: (date) => date.toISOString().slice(0, 10),
    }),
  ),
);

/** What `code:create` takes. docs/PRODUCT.md "Access codes" has the commands. */
export const NewAccessCode = Schema.Struct({
  // Stored upper case; redemption ignores case.
  code: Schema.String.pipe(
    Schema.decodeTo(
      Schema.String.check(
        Schema.isPattern(/^[A-Z0-9][A-Z0-9-]{2,39}$/u, {
          expected: "3 to 40 letters, digits or dashes, like BETA-PRO",
        }),
      ),
      SchemaTransformation.transform({
        decode: (code) => code.trim().toUpperCase(),
        encode: (code) => code,
      }),
    ),
  ),
  // Up to ten years, so every grant ends on a real date.
  days: Schema.Int.check(Schema.isBetween({ maximum: 3650, minimum: 1 })),
  // The last day it can be redeemed, in UTC; it stops at the next midnight.
  lastDay: Schema.optional(Day),
  maxUses: Schema.Int.check(Schema.isBetween({ maximum: 1_000_000, minimum: 1 })),
  plan: PaidPlanId,
});
export type NewAccessCode = typeof NewAccessCode.Type;

/** `code:create` with a code that already exists. */
export class AccessCodeExists extends Data.TaggedError("AccessCodeExists")<{
  readonly code: string;
}> {}

/** `code:revoke` with a code that doesn't exist or has already ended. */
export class AccessCodeNotLive extends Data.TaggedError("AccessCodeNotLive")<{
  readonly code: string;
}> {}

/** Adds a code. Operators run it through `code:create`; the Worker never does. */
export const createAccessCode = Effect.fn("AccessCodes.create")(function* createAccessCode(
  input: NewAccessCode,
) {
  const { db } = yield* Database;
  const [row] = yield* db
    .insert(schema.accessCode)
    .values({
      code: input.code,
      days: input.days,
      expiresAt:
        input.lastDay === undefined
          ? null
          : new Date(input.lastDay.getTime() + Duration.toMillis(Duration.days(1))),
      maxUses: input.maxUses,
      plan: input.plan,
    })
    .onConflictDoNothing()
    .returning();
  if (row === undefined) {
    return yield* new AccessCodeExists({ code: input.code });
  }
  return row;
}, dieOnDatabaseError);

/** Every code, newest first. */
export const listAccessCodes = Effect.fn("AccessCodes.list")(function* listAccessCodes() {
  const { db } = yield* Database;
  return yield* db.select().from(schema.accessCode).orderBy(desc(schema.accessCode.createdAt));
}, dieOnDatabaseError);

/** Ends a live code now. Grants already made keep their own end. */
export const revokeAccessCode = Effect.fn("AccessCodes.revoke")(function* revokeAccessCode(
  input: string,
) {
  const code = input.trim().toUpperCase();
  const { db } = yield* Database;
  const [row] = yield* db
    .update(schema.accessCode)
    .set({ expiresAt: databaseNow })
    .where(
      and(
        eq(schema.accessCode.code, code),
        or(isNull(schema.accessCode.expiresAt), gt(schema.accessCode.expiresAt, databaseNow)),
      ),
    )
    .returning();
  if (row === undefined) {
    return yield* new AccessCodeNotLive({ code });
  }
  return row;
}, dieOnDatabaseError);

/**
 * The plan that sets a user's limits, and the access codes that grant one.
 * A subscription and a grant can both be live; the higher plan wins.
 */
export class Plans extends Context.Service<
  Plans,
  {
    /** `grantEndsAt` is set when an unexpired grant is what lifts the plan. */
    readonly current: (
      userId: string,
    ) => Effect.Effect<{ readonly plan: PlanId; readonly grantEndsAt: Date | null }>;
    readonly redeem: (
      userId: string,
      code: string,
    ) => Effect.Effect<PlanGrant, AccessCodeRefused | RateLimited>;
  }
>()("tranzfer/Plans") {
  /** `allowRedeem` counts one code attempt for the user, true while under `codeRedemptions`. */
  static readonly layer = (allowRedeem: (userId: string) => Effect.Effect<boolean>) =>
    Layer.effect(
      Plans,
      Effect.gen(function* makePlans() {
        const { batch, db } = yield* Database;

        // The code's row when this user can redeem it now, else why not.
        const redeemable = Effect.fn("Plans.redeemable")(function* redeemable(
          userId: string,
          code: string,
          now: number,
        ) {
          const [row] = yield* db
            .select({
              days: schema.accessCode.days,
              expired: sql`coalesce(${schema.accessCode.expiresAt} <= ${latest(now)}, 0)`.mapWith(
                Boolean,
              ),
              maxUses: schema.accessCode.maxUses,
              plan: schema.accessCode.plan,
              uses: schema.accessCode.uses,
            })
            .from(schema.accessCode)
            .where(eq(schema.accessCode.code, code));
          const held = yield* db.query.planGrant.findFirst({
            columns: { code: true },
            where: { code, userId },
          });
          if (row === undefined) {
            return yield* new AccessCodeRefused({ reason: "unknown" });
          }
          if (held !== undefined) {
            return yield* new AccessCodeRefused({ reason: "alreadyRedeemed" });
          }
          if (row.expired) {
            return yield* new AccessCodeRefused({ reason: "expired" });
          }
          if (row.uses >= row.maxUses) {
            return yield* new AccessCodeRefused({ reason: "usedUp" });
          }
          return row;
        });

        return Plans.of({
          current: Effect.fn("Plans.current")(function* current(userId: string) {
            const now = yield* Clock.currentTimeMillis;
            const subscription = yield* db.query.subscription.findFirst({
              columns: { plan: true },
              where: { userId },
            });
            const grants = yield* db.query.planGrant.findMany({
              columns: { endsAt: true, plan: true },
              where: { endsAt: { gt: new Date(now) }, userId },
            });
            // The highest granted plan, and of those the one that runs longest.
            const [grant] = grants.toSorted(
              (a, b) => rank(b.plan) - rank(a.plan) || b.endsAt.getTime() - a.endsAt.getTime(),
            );
            const subscribed = subscription?.plan ?? "free";
            return grant !== undefined && rank(grant.plan) > rank(subscribed)
              ? { grantEndsAt: grant.endsAt, plan: grant.plan }
              : { grantEndsAt: null, plan: subscribed };
          }, dieOnDatabaseError),

          redeem: Effect.fn("Plans.redeem")(function* redeem(userId: string, input: string) {
            if (!(yield* allowRedeem(userId))) {
              return yield* new RateLimited({
                limit: "codeRedemptions",
                retryAfterSeconds: rateLimits.codeRedemptions.windowSeconds,
              });
            }
            const code = input.trim().toUpperCase();
            const now = yield* Clock.currentTimeMillis;
            const row = yield* redeemable(userId, code, now);
            const grant = {
              endsAt: new Date(now + Duration.toMillis(Duration.days(row.days))),
              plan: row.plan,
            };
            // One transaction: the grant and the use land together or not at
            // all. The grant reads its plan from the code only while the code
            // is still open as the batch runs. A code revoked, expired or used
            // up since the read gives null, the grant's NOT NULL plan fails
            // and nothing lands. A second redemption by this user fails the
            // grant's primary key.
            const stillOpen = db
              .select({ plan: schema.accessCode.plan })
              .from(schema.accessCode)
              .where(
                and(
                  eq(schema.accessCode.code, code),
                  or(
                    isNull(schema.accessCode.expiresAt),
                    gt(schema.accessCode.expiresAt, latest(now)),
                  ),
                  lt(schema.accessCode.uses, schema.accessCode.maxUses),
                ),
              );
            const redeemed = yield* Effect.result(
              batch([
                db.insert(schema.planGrant).values({
                  code,
                  endsAt: grant.endsAt,
                  plan: sql`(${stillOpen})`,
                  userId,
                }),
                db
                  .update(schema.accessCode)
                  .set({ uses: sql`${schema.accessCode.uses} + 1` })
                  .where(eq(schema.accessCode.code, code)),
              ]),
            );
            if (redeemed._tag === "Failure") {
              // Lost a race: the second look names why, and nothing naming
              // it means a real database fault.
              yield* redeemable(userId, code, now);
              return yield* Effect.die(redeemed.failure);
            }
            return grant;
          }, dieOnDatabaseError),
        });
      }),
    );
}

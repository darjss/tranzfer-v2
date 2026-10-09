import { AccessCodeRefused, PlanId, RateLimited, rateLimits } from "@tranzfer/contracts";
import type { PlanGrant } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { eq, sql } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const rank = (plan: PlanId) => PlanId.literals.indexOf(plan);

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
          const row = yield* db.query.accessCode.findFirst({ where: { code } });
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
          if (row.expiresAt !== null && row.expiresAt.getTime() <= now) {
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
            // One transaction: the use and the grant land together or not at
            // all. A concurrent redemption that takes the last use fails the
            // uses <= max_uses check, and a second one by this user fails the
            // grant's primary key.
            const redeemed = yield* Effect.result(
              batch([
                db
                  .update(schema.accessCode)
                  .set({ uses: sql`${schema.accessCode.uses} + 1` })
                  .where(eq(schema.accessCode.code, code)),
                db.insert(schema.planGrant).values({ ...grant, code, userId }),
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

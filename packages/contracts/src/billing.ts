import * as Schema from "effect/Schema";

import { RetentionDays } from "./delivery";

const GB = 1000 ** 3;

/** The plan catalog. docs/PRODUCT.md is the spec; every limit in the app reads from here. */
export const plans = {
  free: { activeBytes: 20 * GB, maxRetentionDays: 3, monthlyUsd: 0, name: "Free" },
  pro: { activeBytes: 1000 * GB, maxRetentionDays: 14, monthlyUsd: 29, name: "Pro" },
  starter: { activeBytes: 300 * GB, maxRetentionDays: 7, monthlyUsd: 15, name: "Starter" },
  studio: { activeBytes: 3000 * GB, maxRetentionDays: 14, monthlyUsd: 69, name: "Studio" },
} as const satisfies Record<
  string,
  {
    readonly activeBytes: number;
    readonly maxRetentionDays: RetentionDays;
    readonly monthlyUsd: number;
    readonly name: string;
  }
>;

export const RateLimitName = Schema.Literals([
  "authRequests",
  "codeRedemptions",
  "deliveriesPerDay",
  "deliveriesPerHour",
  "emailRequests",
  "emailsAccountPerDay",
  "emailsPerDay",
  "interestSignups",
  "newAccounts",
  "uploadSigning",
]);
export type RateLimitName = typeof RateLimitName.Type;

/**
 * Rate limits, per rolling window. docs/PRODUCT.md is the spec. The auth and
 * interest-list limits count per client IP and access code attempts per user,
 * on every plan. Delivery emails count per sender on every plan, except
 * `emailsAccountPerDay`, which counts every sender together and keeps them
 * under the account's 1,000 a day sending quota with room for the welcome and
 * interest emails. The rest count per sender on the Free plan only, and paid
 * or comp plans have none. Cloudflare's rate-limit binding enforces the 10 and 60
 * second windows, the only periods it offers.
 */
export const rateLimits = {
  authRequests: { limit: 30, windowSeconds: 60 },
  codeRedemptions: { limit: 5, windowSeconds: 60 },
  deliveriesPerDay: { limit: 100, windowSeconds: 24 * 60 * 60 },
  deliveriesPerHour: { limit: 20, windowSeconds: 60 * 60 },
  emailRequests: { limit: 10, windowSeconds: 60 },
  emailsAccountPerDay: { limit: 800, windowSeconds: 24 * 60 * 60 },
  emailsPerDay: { limit: 50, windowSeconds: 24 * 60 * 60 },
  interestSignups: { limit: 10, windowSeconds: 60 },
  newAccounts: { limit: 10, windowSeconds: 24 * 60 * 60 },
  uploadSigning: { limit: 200, windowSeconds: 10 },
} as const satisfies Record<
  RateLimitName,
  { readonly limit: number; readonly windowSeconds: number }
>;

/** Over one of `rateLimits`; the same request works again after `retryAfterSeconds`. */
export class RateLimited extends Schema.TaggedError<RateLimited>()("RateLimited", {
  limit: RateLimitName,
  retryAfterSeconds: Schema.Int,
}) {}

export const PlanId = Schema.Literals(["free", "starter", "pro", "studio"]);
export type PlanId = typeof PlanId.Type;

/** Plans with a Polar product, cheapest first. */
export const PaidPlanId = Schema.Literals(["starter", "pro", "studio"]);
export type PaidPlanId = typeof PaidPlanId.Type;

/**
 * `past_due` keeps the paid plan while Polar retries the charge, and `canceled`
 * keeps it until the paid period ends. `comp` is a plan granted without Polar
 * (staging test user); webhooks never overwrite it.
 */
export const SubscriptionStatus = Schema.Literals([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "comp",
  "none",
]);
export type SubscriptionStatus = typeof SubscriptionStatus.Type;

export const BillingSummary = Schema.Struct({
  /** A paid subscription that stops at `periodEnd` instead of renewing. */
  cancelsAtPeriodEnd: Schema.Boolean,
  /** The plan comes from an access code until then. Null when a subscription or Free sets it. */
  grantEndsAt: Schema.NullOr(Schema.DateFromString),
  limitBytes: Schema.Int,
  maxRetentionDays: RetentionDays,
  periodEnd: Schema.NullOr(Schema.DateFromString),
  plan: PlanId,
  status: SubscriptionStatus,
  usedBytes: Schema.Int,
});
export interface BillingSummary extends Schema.Schema.Type<typeof BillingSummary> {}

/** The delivery would push the sender's active transfer space past the plan limit. */
export class OverPlanLimit extends Schema.TaggedError<OverPlanLimit>()("OverPlanLimit", {
  limitBytes: Schema.Int,
  plan: PlanId,
  requestedBytes: Schema.Int,
  usedBytes: Schema.Int,
}) {}

/** The plan does not keep links that long. */
export class RetentionNotInPlan extends Schema.TaggedError<RetentionNotInPlan>()(
  "RetentionNotInPlan",
  { maxRetentionDays: RetentionDays, plan: PlanId, requestedDays: RetentionDays },
) {}

/**
 * Checkout or the billing portal can't open. `notOpen`: this stage doesn't
 * sell paid plans yet (docs/PRODUCT.md), so retrying won't help. `provider`:
 * Polar could not be reached or refused the request.
 */
export class BillingUnavailable extends Schema.TaggedError<BillingUnavailable>()(
  "BillingUnavailable",
  { reason: Schema.Literals(["notOpen", "provider"]) },
) {}

/** A paid plan an access code gives for free until `endsAt`. */
export const PlanGrant = Schema.Struct({ endsAt: Schema.DateFromString, plan: PaidPlanId });
export interface PlanGrant extends Schema.Schema.Type<typeof PlanGrant> {}

/** What a person types or a `?code=` link carries. Case and surrounding spaces don't matter. */
export const AccessCodeInput = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));

/**
 * The code gave nothing. `unknown`: no such code. `expired`: past its last
 * day. `usedUp`: every use is taken. `alreadyRedeemed`: this user has it.
 */
export class AccessCodeRefused extends Schema.TaggedError<AccessCodeRefused>()(
  "AccessCodeRefused",
  { reason: Schema.Literals(["unknown", "expired", "usedUp", "alreadyRedeemed"]) },
) {}

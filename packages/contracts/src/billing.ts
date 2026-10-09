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
  "deliveriesPerDay",
  "deliveriesPerHour",
  "newAccounts",
  "uploadSigning",
]);
export type RateLimitName = typeof RateLimitName.Type;

/**
 * Rate limits, per rolling window. docs/PRODUCT.md is the spec. The auth
 * limits count per client IP on every plan; the rest count per sender on the
 * Free plan only, and paid or comp plans have none. Cloudflare's rate-limit
 * binding enforces the 10 and 60 second windows, the only periods it offers.
 */
export const rateLimits = {
  authRequests: { limit: 30, windowSeconds: 60 },
  deliveriesPerDay: { limit: 100, windowSeconds: 24 * 60 * 60 },
  deliveriesPerHour: { limit: 20, windowSeconds: 60 * 60 },
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

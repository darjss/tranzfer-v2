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

/** Polar could not be reached or refused the request. */
export class BillingUnavailable extends Schema.TaggedError<BillingUnavailable>()(
  "BillingUnavailable",
  {},
) {}

import * as Schema from "effect/Schema";

import { PaidPlanId } from "./billing";

/** Loose on purpose: the confirmation email is the real check. */
export const EmailAddress = Schema.String.check(
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u),
);

/**
 * Asks to hear once when a paid plan opens. Without `email` the signed-in
 * account's address is used, and a signed-out caller gets `Unauthorized`.
 */
export const JoinInterestPayload = Schema.Struct({
  email: Schema.optional(EmailAddress),
  plan: PaidPlanId,
});

/** The address that will get the email. */
export const InterestJoined = Schema.Struct({ email: Schema.String });

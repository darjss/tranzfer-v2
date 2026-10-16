import { RateLimited, rateLimits } from "@tranzfer/contracts";
import type { RateLimitName } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

/**
 * The limits Cloudflare's rate-limit binding counts, each with its own
 * binding and namespace. Namespace ids are unique per account and every stage
 * shares them: take the next number, never reuse or renumber one. The other
 * `rateLimits` are counted exactly in D1.
 */
export const bindingLimits = {
  authRequests: { binding: "AUTH_REQUESTS", namespaceId: 1001, rule: rateLimits.authRequests },
  emailRequests: { binding: "EMAIL_REQUESTS", namespaceId: 1005, rule: rateLimits.emailRequests },
  interestSignups: {
    binding: "INTEREST_SIGNUPS",
    namespaceId: 1004,
    rule: rateLimits.interestSignups,
  },
  portalCallsPerIp: {
    binding: "PORTAL_CALLS_PER_IP",
    namespaceId: 1008,
    rule: rateLimits.portalCallsPerIp,
  },
  portalCallsPerRequest: {
    binding: "PORTAL_CALLS_PER_REQUEST",
    namespaceId: 1009,
    rule: rateLimits.portalCallsPerRequest,
  },
  portalUploadsPerIp: {
    binding: "PORTAL_UPLOADS_PER_IP",
    namespaceId: 1010,
    rule: rateLimits.portalUploadsPerIp,
  },
  // Browser trace uploads per client IP. The relay answers a bare 429, so
  // this limit never reaches the wire. docs/PRODUCT.md has the number.
  telemetryRelay: {
    binding: "TELEMETRY_RELAY",
    namespaceId: 1011,
    rule: { limit: 120, windowSeconds: 60 },
  },
  uploadSigning: { binding: "UPLOAD_SIGNING", namespaceId: 1002, rule: rateLimits.uploadSigning },
} as const;

type BindingLimit = keyof typeof bindingLimits;

/** Counts hits per key under one of `bindingLimits`. */
export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    /** Counts one hit for `key`; true while it is under the limit. */
    readonly allow: (name: BindingLimit, key: string) => Effect.Effect<boolean>;
    /** `allow`, failing with `RateLimited` once `key` is over the limit. */
    readonly check: (
      name: BindingLimit & RateLimitName,
      key: string,
    ) => Effect.Effect<void, RateLimited>;
  }
>()("tranzfer/RateLimiter") {
  static readonly make = (allow: (name: BindingLimit, key: string) => Effect.Effect<boolean>) =>
    RateLimiter.of({
      allow,
      check: Effect.fn("RateLimiter.check")(function* check(name, key) {
        if (!(yield* allow(name, key))) {
          return yield* new RateLimited({
            limit: name,
            retryAfterSeconds: bindingLimits[name].rule.windowSeconds,
          });
        }
      }),
    });
}

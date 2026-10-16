# Plan 04: One RateLimiter service replaces six ad-hoc ways of injecting a rate-limit binding

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval (editing the existing `apps/api/test/support.ts` helper is in scope). Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src apps/api/test/support.ts packages/contracts/src/billing.ts`. Changed = compare excerpts to live code; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M (two PRs: 1 add service + adapters and migrate callers; 2 delete leftovers) | **Risk**: MED (Alchemy resource identity) | **Depends on**: none | **Category**: tech-debt (deepening)
- **Planned at**: commit `0a61bc5`, 2026-10-12
- **Drift from plan 21**: `codeRedemptions`, `passwordAttemptsPerIp` and `passwordAttemptsPerLink` are now counted exactly in D1 by `Attempts` (`apps/api/src/attempts.ts`). Their bindings (1003, 1006, 1007) are gone, `SharedLinks.layer` and `Plans.layer` take no limiter, and seven bindings remain for this plan.

## Why this matters

Ten Cloudflare rate-limit bindings are declared in `apps/api/src/index.ts:114-191` as ten near-identical 6-line blocks, then handed to the services in six different shapes:

- `SigningRate` service with one method (`transfers.ts:65-68`),
- `SharedLinks.layer({ allowIp, allowLink })` (`shared-links.ts:62-63`, wired at `index.ts:214-217`),
- `FileRequests.layer(PortalRates)` (`file-requests.ts:67-71`),
- `Emails.layer({ allowDeliveryEmail, allowInterest, ... })` (`emails.ts:215-220`),
- `Plans.layer(allowRedeem)` (`plans.ts:160`),
- `makeAuth(stage, handle, allowRequest)` (`infrastructure/auth.ts:189-193`).
  The same "count, and on false fail with `RateLimited({ limit, retryAfterSeconds: windowSeconds })`" block is repeated at `shared-links.ts:212-221`, `file-requests.ts:53-54,199,219,319`, `emails.ts:357-362,382-387`, `plans.ts:225-230`. Adding a limit touches `RateLimitName`, `rateLimits`, `index.ts`, the layer options type, `apps/web/src/api/errors.ts` and `apps/api/test/support.ts`. The tests already supply a second adapter (an in-memory `counting(limit)`, `apps/api/test/support.ts:52-61`), so the seam is real: two adapters (Cloudflare binding, in-memory).

## Target design

A `RateLimiter` `Context.Service` in a new file `apps/api/src/rate-limiter.ts` (a new source file, not a test file):

```ts
export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    /** Counts one hit for `key` under the named rule; true while under the limit. */
    readonly allow: (name: BindingRateLimit, key: string) => Effect.Effect<boolean>;
    /** `allow`, failing with RateLimited({ limit: name, retryAfterSeconds: windowSeconds }). */
    readonly check: (name: BindingRateLimit, key: string) => Effect.Effect<void, RateLimited>;
  }
>()("tranzfer/RateLimiter") {}
```

`BindingRateLimit` is the subset of `RateLimitName` that Cloudflare enforces: `authRequests, codeRedemptions, emailRequests, interestSignups, passwordAttemptsPerIp, passwordAttemptsPerLink, portalCallsPerIp, portalCallsPerRequest, portalUploadsPerIp, uploadSigning` (the other five names are counted in D1 and stay as they are). Define it as a `const bindingLimits = { authRequests: { binding: "AUTH_REQUESTS", namespaceId: 1001 }, ... } as const` next to the service so index.ts builds the ten bindings with one loop and the logical names and namespace ids stay exactly as today.

Adapters: `RateLimiter.layerCloudflare(clients)` (the current `limiter(...)` function from `index.ts:105-113`, including fail-open with a warning log) and `RateLimiter.layerMemory` (a `counting` map keyed by `${name}:${key}` using `rateLimits[name].limit`, for `apps/api/test/support.ts`).

## Current state (key excerpts)

`index.ts:105-127`:

```ts
const limiter = (client: Cloudflare.RateLimitClient) => (key: string) =>
  client.limit({ key: `${stageKey}:${key}` }).pipe(
    Effect.map(({ success }) => success),
    // A limiter outage must not lock anyone out.
    Effect.catchTag("RateLimitError", (error) =>
      Effect.logWarning("rate limit check failed", error.message).pipe(Effect.as(true)),
    ),
    Effect.provide(RuntimeContext.phantom),
  );
const authRequests = yield* Cloudflare.RateLimit("AUTH_REQUESTS", {
  namespaceId: 1001,
  simple: { limit: rateLimits.authRequests.limit, period: rateLimits.authRequests.windowSeconds },
});
const uploadSigning = yield* Cloudflare.RateLimit("UPLOAD_SIGNING", { namespaceId: 1002, ... });
```

(ids/names: AUTH_REQUESTS 1001, UPLOAD_SIGNING 1002, CODE_REDEMPTIONS 1003, INTEREST_SIGNUPS 1004, EMAIL_REQUESTS 1005, PASSWORD_ATTEMPTS_IP 1006, PASSWORD_ATTEMPTS_LINK 1007, PORTAL_CALLS_PER_IP 1008, PORTAL_CALLS_PER_REQUEST 1009, PORTAL_UPLOADS_PER_IP 1010.) The services wired at `index.ts:199-236`.

## Commands you will need

| Purpose    | Command                                                                                   | Expected                                                           |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Check      | `vp check`                                                                                | exit 0                                                             |
| Tests      | `vp run test`                                                                             | pass                                                               |
| Infra diff | `vp run plan` (root script `plan`, needs Cloudflare credentials; run on a dev stage only) | **no** resource create/replace/delete for any `RateLimit` resource |

## Scope

**In scope**: new `apps/api/src/rate-limiter.ts`; `index.ts`, `transfers.ts`, `shared-links.ts`, `file-requests.ts`, `emails.ts`, `plans.ts`, `infrastructure/auth.ts`, `apps/api/test/support.ts`.
**Out of scope**: `packages/contracts/src/billing.ts` limits and numbers, D1-counted limits (deliveries/hour, emailsPerDay, newAccounts), `apps/web/src/api/errors.ts`, any new test file.

## Steps

PR 1

1. Create `rate-limiter.ts` with the service, `bindingLimits`, `layerCloudflare`, `layerMemory`. Keep the `Effect.fn`/`Context.Service` style of `link-tokens.ts`.
2. In `index.ts` replace the ten blocks by a loop over `bindingLimits` creating `Cloudflare.RateLimit(binding, { namespaceId, simple: { limit, period } })` with the same logical id strings. **Verify**: `vp run plan` on a dev stage shows no change to the ten rate-limit resources. If any shows replace/create, STOP.
3. Provide `RateLimiter.layerCloudflare` once in the isolate layer (`index.ts:199-208`).
4. Migrate one service per commit, deleting its option/param and its hand-written `RateLimited` block in favor of `yield* limiter.check("passwordAttemptsPerIp", ip)`: SharedLinks, FileRequests (delete `PortalRates` and `limited`), Emails, Plans, Transfers (`allow` stays because only Free is held, `transfers.ts:290-299`), Auth (`allow("authRequests", ip)`). Layers lose their parameters, so `SharedLinks.layer`, `FileRequests.layer`, `Emails.layer`, `Plans.layer` become plain layers (Emails keeps `appUrl`/`background`).
5. Delete the `SigningRate` service (`transfers.ts:60-68`) once Transfers uses `RateLimiter`.
6. Update `apps/api/test/support.ts` `domainLayer` to provide `RateLimiter.layerMemory`; delete `counting`. Do not change any assertion in the existing tests.
   PR 2 (after PR 1 is merged): remove dead imports and re-run the drift check.

**Verify each commit**: `vp check` and `vp run test` exit 0.

## Test plan

No new test files. The existing tests that hit limits (`shared-links.test.ts` password attempts, `deliveries.test.ts` emails, `transfers.test.ts` signing) must pass with the in-memory adapter. If the memory adapter's limits differ from the old per-function maps, tests that exhaust a limit may behave differently: keep the key shape `${name}:${key}`.

## Done criteria

- [ ] `rg -n "allowIp|allowLink|allowRedeem|allowInterest|allowDeliveryEmail|PortalRates|SigningRate" apps/api` returns nothing
- [ ] `index.ts` has no more than one `Cloudflare.RateLimit(` call site
- [ ] `vp run plan` (dev) shows no RateLimit resource diff
- [ ] `vp check`, `vp run test` exit 0

## STOP conditions

- Alchemy would replace a rate-limit resource (logical id or namespace id changed).
- A test needs an assertion change to pass.
- Fail-open behavior on `RateLimitError` would change for any caller.

## Maintenance notes

New binding limits are one row in `bindingLimits` plus the `rateLimits` entry and the web `tooMany` copy. Note the Cloudflare binding counts per location and approximately, so it is a throttle, not a counter: plan 11 covers password attempts, which need an exact counter.

# Plan 13: Rate-limit and bound the browser telemetry relay

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without approval. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/infrastructure/telemetry.ts apps/api/src/index.ts packages/contracts/src/billing.ts apps/web/src/routes/api/telemetry apps/web/src/api/telemetry.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW | **Depends on**: none (if plan 04 landed, add the limit as one `bindingLimits` row instead of a new binding block) | **Category**: security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`POST /api/telemetry/traces` (`infrastructure/telemetry.ts:136-203`, registered at `index.ts:293`) is reachable by anyone. Its only gate is `request.headers.origin !== origin` (`:142`), a header any non-browser client can set. There is no rate limit (the route sits outside every limiter; `rateLimits` has no entry), the body cap is 256 KiB per request (`MAX_BODY_BYTES`), and each request carries up to that many bytes of spans forwarded to the stage's Axiom traces dataset using the ingest token. Spans are `Schema.Record(Schema.String, Schema.Json)` with no limit on count or attribute keys (`:94-105`), and `isScrubbed` (the redaction of `url.query`, `url.full`, headers) is applied only to the API's own tracer, not to relayed browser spans. Consequences: anyone can fill the dataset (the free Axiom plan has ingest limits) or inject fake `tranzfer-web` spans, and a future browser span attribute that carries a URL would reach Axiom unscrubbed. Impact is on observability integrity and quota, not on user data, hence P2.

## Current state

`telemetry.ts:136-148`:

```ts
export const relayTraces = ({ client, origin, target }: Effect.Success<typeof relayConfig>) =>
  Effect.gen(function* relay() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (target === undefined) { return status(204); }
    if (request.headers.origin !== origin) { return status(403); }
    if (!request.headers["content-type"]?.startsWith("application/json")) { return status(415); }
```

The browser exporter batches at most 50 spans every 5 seconds and flushes on hide (`apps/web/src/api/telemetry.ts:36-48`), so one browser sends at most about 12 requests a minute plus flushes. The web Worker forwards the request unchanged to the API (`apps/web/src/routes/api/telemetry/traces.ts:7-10`), so `cf-connecting-ip` reaches the API; `clientIp(headers)` is in `infrastructure/auth.ts:60`. Rate limits use Cloudflare's rate-limit binding with `rateLimits` in `packages/contracts/src/billing.ts:54-73` and `RateLimitName` (`:23-39`); every name needs copy in `apps/web/src/api/errors.ts:82-98` (`tooMany`, typed `satisfies Record<RateLimitName, string>`).

## Commands you will need

| Purpose | Command       | Expected |
| ------- | ------------- | -------- |
| Check   | `vp check`    | exit 0   |
| Tests   | `vp run test` | pass     |

## Scope

**In scope**: `telemetry.ts`, `index.ts` (binding wiring), `packages/contracts/src/billing.ts`, `apps/web/src/api/errors.ts` (one required line because of the `satisfies` type).
**Out of scope**: the browser exporter, Axiom resources, the API's own tracer.

## Steps

1. Add `telemetryRelay: { limit: 120, windowSeconds: 60 }` to `rateLimits` and `RateLimitName`, copy line in `errors.ts` `tooMany` ("Too much telemetry from your network." is never shown, but the type requires text). Choose 120/min per IP: 10x the normal browser rate, so several tabs behind one NAT pass. Confirm with the founder if they want it tighter.
2. Wire a Cloudflare rate-limit binding with the same shape as the others in `index.ts` (namespace id `1011`, name `TELEMETRY_RELAY`; ids 1001-1010 are taken). In `relayTraces`, after the `target === undefined` check and before reading the body, `if (!(yield* allow(clientIp(...)))) return status(429)`. A limiter outage must fail open, as the existing `limiter` does (`index.ts:105-113`).
3. Bound the body schema: `spans: Schema.Array(...).check(Schema.isMaxLength(500))`, and for each span require string `traceId`, `spanId`, `name`. Reject (400) anything else. Drop any attribute whose key `isScrubbed` flags, and any attribute key starting `http.` or `url.` that is not on a short allowlist, before forwarding; mirror the API tracer's rule so one function decides.
4. **Verify**: `vp check`; `vp run test`. Then on the PR preview, load the app in a browser and confirm spans still arrive in the staging dataset (Axiom, service `tranzfer-web`), and `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://pr-N.tranzfer.app' -H 'content-type: application/json' -d '{"resourceSpans":[]}' https://pr-N.tranzfer.app/api/telemetry/traces` returns 204, and 130 quick repeats return 429 at least once.

## Test plan

No new test files. Behavior is verified by the manual calls above; the exporter's request shape is covered by nothing else, so also load the dashboard and finish one upload to see browser spans.

## Done criteria

- [ ] `vp check`, `vp run test` exit 0
- [ ] A burst over 120/min from one IP gets 429 on staging
- [ ] Browser spans still reach the dataset
- [ ] `rg -n "telemetryRelay" apps packages` shows contracts, errors.ts, index.ts, telemetry.ts

## STOP conditions

- Legitimate browser traffic is limited in normal use (check the 429 count in Axiom after a day).
- The span schema rejects spans the current exporter produces (the browser sends `OtlpSerialization.layerJson`; compare one real payload before tightening).

## Maintenance notes

The Origin check stays as a CSRF-style filter for browsers; it is not authentication. Rate-limit binding counters are per location and approximate (Cloudflare docs: "not an accurate accounting system"), which is fine for a throttle.

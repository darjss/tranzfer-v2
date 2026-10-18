# Plan 12: D1 read replication through the Sessions API, with a read-your-writes rule

> **Executor instructions**: This is the largest plan here and it has a measurement gate. Do PR A and PR B (no behavior change while replication is off), then stop and wait for the gate in step 8 before PR C. Follow step by step; run each verification; STOP on any STOP condition. No new test files without approval. Work in a worktree off current `origin/dev`. Deploys come from CI only (AGENTS.md).
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- packages/db/src apps/api/src/index.ts apps/api/src/rpc.ts apps/api/src/infrastructure/auth.ts apps/api/src/resources.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P3 (after plans 10 and 11 are measured) | **Effort**: L (three PRs, ~350 lines total) | **Risk**: HIGH if rushed (a stale read can look like "signed out" or "link not ready") | **Depends on**: plan 04 is not required; plan 10 and 11 first, because they may remove the need | **Category**: perf
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

Reads dominate D1 traffic. Counting queries in the code (read-only RPCs and the read part of write RPCs): `GetMe` 1-2 session reads; `ListDeliveries` 2 reads plus session; `GetBilling` about 4 reads plus session; `CreateDelivery` about 7 reads plus 1 batch; `SignUpload` 1 read (plus session) for each of ~1,600 parts per 100 GB; `OpenLink` 1 read; `UnlockLink`, `ReportDownload` 1 read. Writes are rare by comparison. D1 read replication puts read-only copies in every supported region, and the Sessions API lets a Worker read from a nearby replica while keeping sequential consistency. Plan 11 removes the session reads first; plan 10 may remove the distance. This plan is the one to do only if, after those, read latency from far regions still matters.

## What is supported (checked)

- Alchemy 2.0.0-beta.81: `Cloudflare.D1.Database("App", { readReplication: { mode: "auto" | "disabled" } })` (`alchemy/src/Cloudflare/D1/Database.ts:65`); it is "the only mutable property after creation; toggling triggers an in-place update". `primaryLocationHint` and `jurisdiction` are creation-only.
- Worker binding: `D1Database.withSession(constraintOrBookmark?)` returns a `D1DatabaseSession` with `prepare`, `batch`, `getBookmark()`; constraints are `"first-primary"` and `"first-unconstrained"` (`@cloudflare/workers-types` 5.20261006.1, `index.d.ts:15025-15062`). The Sessions API is available only through the Worker binding (Cloudflare docs https://developers.cloudflare.com/d1/best-practices/read-replication/). Writes always go to the primary. Replicas lag; a session hides the lag for its own reads (monotonic reads, read-my-own-writes) but not for other clients. No extra charge; billing is rows read/written. Disabling replication leaves replicas serving for up to 24 hours.
- `Cloudflare.D1.QueryDatabase(App)` exposes `d1.raw` (the binding, `index.ts:52-53`).
- Gap: `@effect/sql-d1`'s `D1Client` takes `db: D1Database` (`D1Client.ts:117`) but calls only `db.prepare` (`:226,255,265,292`) and `db.batch` (`:177`). A `D1DatabaseSession` has exactly those two. The type does not match, so one narrow cast with a comment is needed (CONVENTIONS allows a cast with a stated invariant), or an upstream issue. drizzle's `drizzle(handle)` in `infrastructure/auth.ts:202` has the same typing gap.

## Target design

- One session per invocation, shared by the domain `Database` and Better Auth, so every query in a request goes through the same session.
- The browser carries the bookmark in a cookie `d1b` (not secret; `HttpOnly; Secure; SameSite=Lax; Path=/`; `Max-Age` a few minutes). Reasons: the web Worker already forwards `Cookie` and `Set-Cookie` between browser and API for auth, on `/rpc` (server rendering never calls the API since #184), so no web change is needed. The API sets the cookie with the same `HttpEffect.appendPreResponseHandler` hook `AuthenticatedLive` uses (`rpc.ts:31-35`).
- Session start: bookmark present => `withSession(bookmark)`; absent => `withSession("first-unconstrained")`. After the handler, `session.getBookmark()` goes into the cookie when not null.
- Always `first-primary` (no replica for the first query): the cron (`index.ts:240`), the Polar webhook (`index.ts:272`), `SharedLinks.unlock` and `SetLinkPassword` (they depend on `link.passwordHash`, and an unlock is bound to the stored hash, `link-tokens.ts` `verifyUnlock`).
- Negative re-check for public reads: `OpenLink`, `OpenFileRequest` run on the replica session; if they would fail with `LinkNotFound`, `LinkNotReady` or `RequestNotFound`, run once more on a `first-primary` session before answering. This covers a recipient opening a link seconds after the sender finalized it (they share no bookmark).
- Auth: the Better Auth handler (`/api/auth/*`) must run in the same scheme and emit the bookmark, otherwise sign-in (a write) followed by `GetMe` (a read on a stale replica) can come back `Unauthorized`. This is the main hazard.

## Current state (key excerpts)

`apps/api/src/index.ts:210-213`:

```ts
// A D1 client belongs to one invocation, so the services over it are
// rebuilt per request (and per cron run) with a fresh memo map.
const database = Layer.unwrap(Effect.map(handle, Database.fromD1));
```

`packages/db/src/database.ts:61-63`: `static readonly fromD1 = (db: D1Database) => Database.layer.pipe(Layer.provide(D1Client.layer({ db })), Layer.orDie);`
`infrastructure/auth.ts:199-204`: Better Auth gets `drizzle(handle)` from `d1: Effect.Effect<D1Database>`.
`packages/db/src/testing.ts`: tests run on `getPlatformProxy` local D1.

## Commands you will need

| Purpose     | Command                                             | Expected |
| ----------- | --------------------------------------------------- | -------- |
| Check       | `vp check`                                          | exit 0   |
| Tests       | `vp run test`                                       | pass     |
| Web build   | `vp run --filter @tranzfer/web build`               | exit 0   |
| Staging e2e | `vp run test:e2e` (against staging or a PR preview) | pass     |

## Scope

**A**: `packages/db/src/database.ts` (accept a session), `apps/api/src/index.ts`, `apps/api/src/rpc.ts`.
**B**: `apps/api/src/infrastructure/auth.ts`, `index.ts` (auth route).
**C**: `apps/api/src/resources.ts` (`readReplication: { mode: "auto" }`), `apps/api/src/shared-links.ts`/`file-requests.ts` (negative re-check).
**Out of scope**: `primaryLocationHint`, KV/cache layers, any change to who may do what, new test files.

## Steps

**PR A (no behavior change; replication stays disabled)**

1. In `packages/db/src/database.ts` add `Database.fromSession(session: D1DatabaseSession)` beside `fromD1`, with the one cast and the invariant comment ("`D1Client` calls only `prepare` and `batch`, which a session implements"). Keep `fromD1` for the cron/webhook (they pass `d1.withSession("first-primary")` through `fromSession` as well, so there is one path).
2. In `index.ts` build the per-invocation `database` layer from `handle` + the request: read the `d1b` cookie from `HttpServerRequest` (for the cron there is none), call `withSession`, and register `appendPreResponseHandler` that appends `Set-Cookie` with `session.getBookmark()`.
3. **Verify**: `vp check`, `vp run test`, web build. Local D1 under `getPlatformProxy` should accept `withSession`; if it does not, STOP and report (tests then need a shim, which needs approval).
   **PR B (Better Auth through the same session)**
4. Make `makeAuth` take the per-invocation session (or a thunk returning it) instead of the raw handle; the bookmark cookie is emitted for `/api/auth/*` responses too. **Verify**: sign in on a PR preview with the staging test login, then `GetMe` succeeds on the first call.
   **Gate (step 8)**
   5-7. With replication still disabled on staging, compare Axiom `RpcServer` p50/p95 for the plan 10 baseline operations; confirm the `d1b` cookie round-trips (browser devtools).
5. Gate: proceed only if, after plans 10 and 11, a read-only RPC from a far region is still slower than the founder's target (ask for the target; do not invent one).
   **PR C (turn it on)**
6. `resources.ts`: `Cloudflare.D1.Database("App", { migrations: ..., readReplication: { mode: "auto" } })`. **Verify**: `vp run plan` shows an in-place update, not a replacement. Merge to `dev` (staging), run `vp run test:e2e`, then promote.
7. Add the negative re-check to `OpenLink` and `OpenFileRequest`.

## Consistency rules to review the PR against

1. Every request is a session; the response carries the newest bookmark; the next request from that browser starts from it. That gives read-your-writes after: finalize then list, set password then list, send email then poll status (`dashboard/deliveries.ts:319-338`), checkout webhook then billing read (the webhook runs on `first-primary`; the browser's later read has the browser's older bookmark, so the plan change can show up a moment late, which the checkout poller at `routes/deliveries.tsx:216-224` already tolerates).
2. Writes and check-then-act statements already live in one SQL statement or batch (`Deliveries.place`, `Emails.reserve`, `admitSignup`, `Plans.redeem`), and writes go to the primary, so replicas do not weaken them.
3. A different actor's write is visible after replica lag (typically sub-second). Reads where that matters (security, ordering) use `first-primary`: unlock, set password, webhook, cron, and the negative re-check.

## Test plan

No new test files. Local D1 has no replicas, so replica behavior is verified only on staging: sign in then immediately `GetMe` (10 times in a loop from a script outside the repo), finalize then immediately list, and open a just-finished link from a second browser.

## Done criteria

- [ ] `vp check`, `vp run test`, web build exit 0 for each PR
- [ ] Staging: 20 consecutive sign-in-then-`GetMe` runs succeed
- [ ] `vp run plan` for PR C shows the D1 `readReplication` change as an update

## STOP conditions

- `withSession` is missing on the local test D1 or the cast is rejected by the lint rules.
- Any flow shows `Unauthorized` or "still uploading" right after a successful write.
- Alchemy would replace the D1 database.

## Maintenance notes

Never log or put the bookmark in a span attribute together with user identity (it is not a secret but it is a timing fingerprint). New writes that a different user reads immediately must use a primary session.

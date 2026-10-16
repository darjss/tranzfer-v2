# Tranzfer deslop audit: plan index

Written against `origin/dev` at commit `0a61bc5` (2026-10-12). Each plan is self-contained: problem with `file:line` evidence, target design, steps with verification, scope, STOP conditions. Gates in every plan: `vp check --quiet`, `vp run test`, and `vp run --filter @tranzfer/web build` when web code changes. **No plan creates a test file**, except a RuleTester test for each custom lint rule.

Plan numbers are identifiers, not an order. Run them by wave. Plans in the same wave touch different files unless the "Conflicts" column says otherwise. Line numbers drift: re-find each `file:line` before editing.

Done and deleted: 17 (#142), 01 (#144), 08 (#145), 18 (#146), 11 (#147), 03 (#165), 02 (#166), 22 (#167), 24 (#168).

## Every plan ships its constraint

A cleanup PR also adds the lint rule, type or check that stops the pattern coming back, at `error`, with zero remaining hits. Plan 16 lists the rule specs. Custom rules live in `tools/oxlint/anti-slop/tranzfer/` (a third plugin next to `effect/`), each with a RuleTester test. Built-in rules (`no-restricted-imports`, `max-lines`, focused tests, `no-console` in tests) go straight into `lint.config.ts`.

## Owner decisions (2026-10-13)

- 22: send waitlist confirmation mail only to signed-in users; store anonymous joins without mailing them.
- 21: make the attempt counters exact and fail closed now; no lockout redesign.
- 24: take `--yes` off `destroy`, retain production D1 and R2, keep separate staging and production `CLOUDFLARE_API_TOKEN` environment secrets.
- 19: do step 1 now (delete oversized objects at finalize); step 2 stays gated on a staging run.
- 14: delete the SSR API client unless `docs/plan/01-foundation.md` needs a server-side API read.

## Order of execution

| Wave | Plan | Title                                                                                | Priority | Size | Depends on            | Status                                                        |
| ---- | ---- | ------------------------------------------------------------------------------------ | -------- | ---- | --------------------- | ------------------------------------------------------------- |
| B    | 10   | Smart Placement on the API Worker, measured on staging                               | P2       | S    | none                  | IN PROGRESS (#174 shipped the line; staging measurement left) |
| B    | 20   | Security headers and a cross-site check on `/rpc`                                    | P2       | S    | none                  | TODO                                                          |
| B    | 13   | Rate-limit and bound the browser telemetry relay                                     | P2       | S    | none                  | TODO                                                          |
| B    | 23   | Privacy page matches the schema; purge sign-up IPs; encrypt OAuth tokens             | P2       | S-M  | none (soft: 01)       | TODO                                                          |
| B    | 19   | Declared upload size equals stored size (step 1 delete; step 2 pinned length, gated) | P2       | S+M  | none                  | TODO                                                          |
| C    | 04   | One `RateLimiter` service replaces six injection shapes                              | P2       | M    | none                  | TODO                                                          |
| C    | 05   | Brand `UserId`, `LinkToken`, `UnlockToken`                                           | P2       | M    | none                  | TODO                                                          |
| C    | 06   | RPC surface: shared error fragments, one session path, IP helper (B: renames)        | P2/P3    | S+S  | soft: 05              | TODO                                                          |
| C    | 09   | Uploads: per-transfer ledger, transport module, typed upload failure                 | P2       | M    | none                  | TODO                                                          |
| C    | 21   | Exact D1 counters for password and code attempts, fail closed                        | P2       | M    | soft: 04, 01          | TODO                                                          |
| C    | 25   | Web reads limits and email codes from contracts; one copy-state                      | P3       | S-M  | none                  | TODO                                                          |
| C    | 15   | File-request rules move from `deliveries.ts` to `file-requests.ts`                   | P3       | M    | none                  | TODO                                                          |
| C    | 07   | Split the waitlist from delivery emails; move pure helpers                           | P3       | M    | 04                    | TODO                                                          |
| C    | 14   | SSR API client: decide, then delete or give it a reader                              | P3       | S    | none                  | TODO                                                          |
| D    | 16   | Custom lint rule specs; each rule lands with the plan that clears its hits           | P2       | M    | 05, 07                | TODO                                                          |
| D    | 12   | D1 read replication with Sessions API                                                | P3       | L    | 10, 11 measured first | TODO                                                          |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (reason) | REJECTED (rationale).

## What can run in parallel

- All of wave A in parallel. Overlaps are small: 17 and 01 both touch `deliveries.ts` (different functions: 17 `place` line 517 and `removeObjects` line 281; 01 `purgeEnded`); 11 and 23 both add one option to the `BetterAuth({...})` call in `infrastructure/auth.ts` (merge order: 11 then 23).
- `apps/api/src/index.ts` is touched by 04, 10, 12, 13, 20, 21 and 07. Land them one at a time in this order: 10, 20, 13, 21, 04, 07, 12. Everything else in a wave can be parallel.
- Web plans (08, 09, 14, 25) and API plans do not share files except `apps/web/src/api/errors.ts` (09 adds a branch, 13 adds one line to `tooMany`, 18 edits one string).
- `packages/contracts` is touched by 05, 06, 13, 17, 18, 22, 25; each edit is local, but rebase before opening the PR.

## Dependencies, with the reason

- 09 after 08: both edit `retry()` in `uploads.ts` (08 adds one statement).
- 07 after 04: both change `Emails.layer` options (04 deletes the limiter parameters).
- 21 soft on 04: if 04 landed, remove two rows from `bindingLimits` instead of two binding blocks; soft on 01 for the `isolated` sweep helper.
- 12 after 10 and 11: the placement and the session cookie cache may remove the need; 12 has a measurement gate.
- 16 flips rules to `error` only after the cleanup plans named in its table land.

## Top findings (all vetted against the code)

1. Database errors reach the browser with SQL text and bound values (`RpcServer` encodes `Die` defects; `drizzle` `EffectDrizzleQueryError.message` includes `params`): `packages/db/src/database.ts:70-72`, `apps/api/src/index.ts:267`. Plan 17.
2. A network blip on the recipient page replaces the file list with "This link doesn't work.": `apps/web/src/routes/d/[token].tsx:323-342`. Plan 08.
3. Public waitlist can exhaust the shared 1,000/day sending quota: `apps/api/src/emails.ts:356-380`, `packages/contracts/src/billing.ts:62`. Plan 22.
4. Password brute-force protection is an approximate, per-location, fail-open counter: `apps/api/src/shared-links.ts` `unlock`, `apps/api/src/index.ts:105-113`. Plan 21.
5. One failing sweep step cancels the other four, and 20 un-purgeable deliveries block all later purges: `apps/api/src/sweeper.ts:14-23`, `apps/api/src/deliveries.ts:676-693`. Plan 01.
6. `vp run destroy` targets production with `--yes`; production D1 has no retention: `infra/package.json`, `apps/api/src/resources.ts:20`. Plan 24.
7. Six different ways to inject a rate-limit binding, ten copy-pasted binding blocks: `apps/api/src/index.ts:114-191`. Plan 04.
8. `uploads.ts` keeps one transfer's state in six parallel maps and cleans them in three hand-copied places: `apps/web/src/uploads/uploads.ts:284-299,411-423`. Plan 09.
9. Presigned PUT/part URLs do not pin the body length, so stored bytes can exceed what was declared and charged: `apps/api/src/infrastructure/r2.ts:30-60`. Plan 19.

## Findings considered and rejected (so nobody re-audits them)

- **Typed constraint errors from D1.** The database layer classifies every driver failure as `UnknownError` (`@effect/sql-d1` `D1Client.ts:34-35`), so a typed unique/foreign-key error is not available. The existing "decide from what landed" re-read after a failed batch (`deliveries.ts:488-520`, `plans.ts:269-276`) is the correct design. Left alone.
- **`dieOnDatabaseError` as policy.** Decided in `docs/STRUCTURE.md`. Kept; plan 17 only changes what the defect carries.
- **OOP or class-heavy code.** None found. Every class is a `Context.Service`, a tagged error, `Api` (RpcGroup) or `ApiWorker`. No manager/factory/inheritance patterns. The one non-idiom is that seven services restate their method signatures in a hand-written interface (see next item).
- **Hand-written service interfaces** (`Deliveries`, `Transfers`, `FileRequests`, `SharedLinks`, `Emails`, `Plans`, `Billing`; about 300 lines, against `docs/CONVENTIONS.md` "Types come from values"). They carry the error contract and the doc comments, and the RPC layer already checks handler error types. Not worth the churn; amend the CONVENTIONS sentence (one service has several implementations only for `Storage`, `Mail`, `SigningRate`) instead. Revisit if plan 06 leaves the unions duplicated.
- **`Deliveries` (806 lines) is long but deep.** `place` is the atomic admission core. Only the file-request rules (plan 15) and the sweeper step are worth moving.
- **Mutation seam in the web.** Sixteen `runPromiseExit` sites repeat `Exit.isFailure(exit) ? appError(exit.cause).message : undefined` (`dashboard/deliveries.ts` x8, `billing.ts`, `Unlock.tsx`, `SaveAll.tsx`, `Pricing.tsx`, `DeliverySheet.tsx`, `routes/d/[token].tsx`). `docs/SOLID-EFFECT-BINDING.md` says to add a mutation helper when real callers need one; the helper would be one line. Optional, speculative.
- **Token domain separation** (a delivery token and a request token are both `HMAC(id)` of one key): ids are disjoint random values, no exploit found. Changing the format invalidates every shared link. Noted in plan 05.
- **Casts and `any`.** Only one assertion outside `as const` in application code (`r2.ts:24`, with a SAFETY comment). No `any`, `@ts-*`, non-null `!`, or `JSON.parse`. Type safety is strong; plan 05 and plan 03 close the remaining gaps (unbranded ids, duplicated enums).
- **Plan ladder encoded three times in the web** (`upgradeFrom`, `unlockedBy`, `planThatFits`): they answer three different questions and two derive from `plans`. Not a finding. The real layering issue, `api/errors.ts` importing `bytes` from `dashboard/format` and `paidPlansOpen` from `ui/support`, is minor.
- **Five identical `cloudflare:workers` forwarder route files.** Pass-through but trivial; leave.
- **Staging login gate.** Production never registers the plugin; unknown stage names die; key compared with `timingSafeEqual`. Correct.
- **Webhook verification.** Standard Webhooks, constant-time, 5-minute window, state rebuilt from Polar. Correct.

## Worth investigating, no plan yet (LOW confidence or product questions)

- API Worker reachable on its own workers.dev URL (`infra/alchemy.run.ts:67` returns `api.url`): disable it or require a header from the web Worker. Check first whether the URL is enabled.
- `Transfers.settle` is list-then-abort, with no size recheck after Complete (`transfers.ts:162-176`); narrow, hard to time. Plan 19 shrinks it.
- `X-Amz-Expires` can be fractional (`r2.ts` `Duration.toSeconds(ttl)` unrounded): R2 accepts it today.
- Concurrent Polar webhooks race on an unconditional upsert (`billing.ts:253-257`); small window; guard with `updatedAt`.
- Link secret has no key id or rotation (`index.ts:54`); losing Alchemy state invalidates all links.
- Double-click on "Yes, start over" opens the file picker twice (`dashboard/Board.tsx:61-70`); cosmetic.
- Uppy ships on every page (`App.tsx:9` static import, `codeSplitting: false`); unmeasured.

## Direction (options, not problems)

1. **Revoke and rotate a link.** `link.revokedAt` is read at `shared-links.ts:92,187,225` and written nowhere; there is no way to cut off one leaked link without cancelling the whole delivery. The read side is done.
2. **The file-request uploader page.** The API for file requests shipped (PR #130, `FileRequests` + 4 token-bound RPCs) and generates `/r/<token>` links, but `apps/web/src/routes` has no `r` route. Every day it sits, the API surface is untested by a client.
3. **Decide SSR reads** (plan 14), because the next page that needs a public, rate-limited read on the server needs the client IP header.

## Not audited

Marketing, guides, compare, legal and landing content in `apps/web/src` (except where they share code); `e2e/` and `bench/` contents; the Polar and Alchemy provider code in `infra/`; `docs/design/` prototypes; dependency upgrades beyond `pnpm audit`. Nothing was executed against staging or production. Effect and Drizzle behavior was read from the installed sources under `/home/orc/dev/tranzfer2/node_modules/.pnpm`.

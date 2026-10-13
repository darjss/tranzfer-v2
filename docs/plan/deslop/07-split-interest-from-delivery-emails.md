# Plan 07: Separate the plan-interest list from delivery emails, and move shared pure helpers out of `deliveries.ts`

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval (editing import lines in existing tests is in scope). Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src apps/api/scripts apps/api/test packages/contracts/src/billing.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P3 | **Effort**: M (~300 lines moved, ~40 new) | **Risk**: LOW (move only) | **Depends on**: plan 04 (both edit `Emails.layer` options; do 04 first to avoid conflicts) | **Category**: tech-debt (deepening: locality)
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`apps/api/src/emails.ts` (478 lines) holds two unrelated modules behind one service:

- the **waitlist for paid plans**: `joinInterest` (`:356`), `sendOpenings` (`:432`), `queueOpenings` (`:147`, run by `scripts/interest-notify.ts:13`), and the copy `onTheList`/`planOpen` (`:119,128`);
- **delivery emails**: `reserve` (`:231`), `refusal` (`:259`), `settle` (`:307`), `sendDelivery` (`:381`), `deliveryEmails` (`:319`), `failLost` (`:341`), `deliveryMessage` (`:69`).
  Their only shared ingredient is the `Mail` adapter. The waitlist has no business depending on `Deliveries` (`:226`), and a delivery-email change loads 150 lines of waitlist copy. Separately, `deliveries.ts` exports two pure helpers other modules import: `secondsUntilRoom` (`deliveries.ts:59`, imported by `emails.ts` and by `infrastructure/auth.ts:30`) and `isExpired` (`deliveries.ts:79`, imported by `shared-links.ts`). `infrastructure/auth.ts` therefore imports from two domain files (`../deliveries`, `../emails`), against `docs/STRUCTURE.md` ("infrastructure owns everything Cloudflare or Alchemy").

Deletion test: deleting the split would put waitlist code and delivery-email code back in one file, so the complexity concentrates in `emails.ts`; the split buys locality, not new interface.

## Current state

`apps/api/src/emails.ts` imports `Deliveries, secondsUntilRoom` from `./deliveries` and `Mail` from `./infrastructure/email`; `Emails` interface has 5 members (`joinInterest, sendOpenings, sendDelivery, deliveryEmails, failLost`) at `:169-207`. Consumers: `rpc.ts:17` (`JoinInterest`, `SendDeliveryEmail`, `DeliveryEmails` handlers), `index.ts:19,219-226`, `sweeper.ts:5,22-23`, `infrastructure/auth.ts:31` (`sendWelcome`), `scripts/interest-notify.ts:13`, `test/deliveries.test.ts:24` (`Emails, queueOpenings, sendWelcome`).

## Commands you will need

| Purpose | Command       | Expected |
| ------- | ------------- | -------- |
| Check   | `vp check`    | exit 0   |
| Tests   | `vp run test` | pass     |

## Scope

**In scope**: `apps/api/src/emails.ts`, new `apps/api/src/interest.ts` (source file), `deliveries.ts`, `shared-links.ts`, `infrastructure/auth.ts`, `rpc.ts`, `index.ts`, `sweeper.ts`, `scripts/interest-notify.ts`, import lines in `apps/api/test/deliveries.test.ts`, `packages/contracts/src/billing.ts` (receives the two pure helpers).
**Out of scope**: behavior, copy text, rate limits, the DB schema, splitting `deliveries.ts` itself.

## Steps

1. Move `secondsUntilRoom` and `isExpired` into `packages/contracts/src/billing.ts` next to `rateLimits` (they are pure, take `rateLimits`-shaped input, and the web may reuse `isExpired`), export through the existing `export * from "./billing"`. Update imports in `emails.ts`, `shared-links.ts`, `infrastructure/auth.ts`, `deliveries.ts`. **Verify**: `vp check`.
2. Create `interest.ts` with `Interest` (`Context.Service`, `"tranzfer/Interest"`) exposing `join`, `sendOpenings`, and export `queueOpenings`, `onTheList`, `planOpen`, `waitingFor`, `OPENINGS_PER_SWEEP`. Move the code verbatim; rename `joinInterest` → `join` only if all call sites are updated in the same commit. `Interest.layer` needs `Database`, `Mail`, `{ appUrl }` and the `interestSignups` limiter (plan 04: `RateLimiter`).
3. `emails.ts` keeps delivery emails, `sendWelcome` (account email, stays here with `message`/`page` helpers; the copy helpers used by both files go in `emails.ts` and `interest.ts` imports them, or duplicate nothing: `message`, `page`, `space` are exported from `emails.ts`).
4. Wire `Interest` in `index.ts`, `rpc.ts` (`JoinInterest` handler), `sweeper.ts` (`interest.sendOpenings`), `scripts/interest-notify.ts`.
5. Update the import line in `test/deliveries.test.ts:24`; do not change assertions.
   **Verify each step**: `vp check`; after step 4 `vp run test`.

## Test plan

No new tests. `apps/api/test/deliveries.test.ts` covers join/notify/openings and delivery emails today; they must pass unchanged.

## Done criteria

- [ ] `emails.ts` no longer mentions `planInterest`; `interest.ts` does not import `Deliveries`
- [ ] `rg -n 'from "\.\./deliveries"' apps/api/src/infrastructure` returns nothing
- [ ] `vp check`, `vp run test` exit 0
- [ ] `wc -l apps/api/src/emails.ts` is under 340

## STOP conditions

- `secondsUntilRoom` or `isExpired` is used by the web with different semantics, or contracts' tsconfig (no DOM/Node lib, see `delivery.ts` comment on `TextEncoder`) rejects them.
- A test needs an assertion change.

## Maintenance notes

`infrastructure/auth.ts` still imports `sendWelcome` from `../emails` and `admitSignup` lives in an infrastructure file while counting D1 rows: both are signs that sign-up policy wants its own module; out of scope here.

# Plan 15: Move the file-request rules out of `deliveries.ts` into `file-requests.ts`

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without approval. Work in a worktree off current `origin/dev`. Behavior must not change; the atomic insert in `place` is the reliability core (docs/RELIABILITY.md).
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/deliveries.ts apps/api/src/file-requests.ts apps/api/src/transfers.ts apps/api/test`. Changed (the SQL cleanup rewrote `requestAccepts`): re-read the live code against the excerpts; structural mismatch = STOP.

## Status

- **Priority**: P3 | **Effort**: M (~150 lines moved, ~20 changed) | **Risk**: MED | **Depends on**: none | **Category**: tech-debt (deepening: locality)
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`Deliveries` (806 lines) is a deep module where it matters: `place` (`deliveries.ts:427-521`) admits a delivery, inserts it atomically under the sender's limits, and names the refusal when the insert loses a race. But it also knows a second domain, file requests:

- `Origin` and `Intake<E>` types (`:82-102`), threaded through `place`;
- `requestBytes` and `requestAccepts` SQL (`:401-423`): "the request is open, unexpired and has room";
- `receive` (`:708-759`) with the request's retention clamp, title (`"<title> from <name>"`), and `explain` that fails `RequestNotFound`/`RequestFull`;
- `Deliveries.receive`'s signature takes a database row, `request: typeof schema.fileRequest.$inferSelect` (`:170-176`), so the table's row type crosses the service interface;
- the error imports `RequestFull`, `RequestNotFound` and `NewRequestUpload`.
  `FileRequests` (`file-requests.ts`) already holds the other half (`live`, the gate; `receive` calls `deliveries.receive(request, input)` at `:322`). A change to request limits means editing both files and `transfers.ts` (`sign` and `finalize` take an optional `requestId` that switches the lookup and the rate rule, `transfers.ts:105-116,281-299`).

## Target design

`Deliveries` exposes the shared admission as a first-class method instead of hiding it in the closure:

```ts
readonly place: <E>(
  senderId: UserId,            // plain string until plan 05 lands
  plan: PlanId,
  input: NewDelivery,
  intake?: Intake<E>,          // origin + extra SQL condition + explain
) => Effect<Delivery, DeliveryConflict | OverPlanLimit | RateLimited | E>
```

with `Intake` extended by a `condition: SQL` field (what `requestAccepts` returns) so `place` no longer builds it. `FileRequests` owns `requestBytes`, `requestAccepts`, `explain`, the retention clamp and the title; `Deliveries.receive` and `Deliveries.ofRequest`'s file-request knowledge move to `FileRequests` (`ofRequest` is a plain query by `requestId`; move it too, it needs `toView`, so export `Deliveries.viewMany(rows)` if needed, or keep `ofRequest` and only move the admission pieces; choose the smaller diff).

## Current state (key excerpts)

`deliveries.ts:95-102` `Intake`; `:427-436` `place` signature and `origin` handling; `:462-465` where the insert's WHERE adds `requestAccepts(origin.requestId, requestedBytes, now)`; `:741-758` `receive` calls `place(ownerId, plan, delivery, { explain, origin })` and maps `OverPlanLimit` to `RequestFull`; `file-requests.ts:314-323` `receive` calls `deliveries.receive(request, input)`.

## Commands you will need

| Purpose | Command       | Expected |
| ------- | ------------- | -------- |
| Check   | `vp check`    | exit 0   |
| Tests   | `vp run test` | pass     |

## Scope

**In scope**: `apps/api/src/deliveries.ts`, `apps/api/src/file-requests.ts`.
**Out of scope**: `transfers.ts` (the `requestId?` parameter stays; its replacement is a separate design), the SQL itself, contracts, new tests.

## Steps

1. Add `condition` to `Intake` and make `place` use `intake?.condition` in the WHERE instead of calling `requestAccepts`. Export `place` on the service. **Verify**: `vp check`, `vp run test`.
2. Move `requestBytes`, `requestAccepts`, the retention clamp, `explain` and the `receive` body into `FileRequests` (its `receive` now builds the `Intake` and calls `deliveries.place`). Delete `Deliveries.receive` and the file-request imports from `deliveries.ts`. **Verify**: `vp check`, `vp run test` (the portal tests live in `apps/api/test/deliveries.test.ts`).
3. Check `deliveries.ts` no longer mentions `fileRequest`.

## Test plan

No new tests. The existing file-request cases in `apps/api/test/deliveries.test.ts` (request full, closed mid-upload, owner over plan reads as full to the uploader, replay of a retried create) must pass unchanged.

## Done criteria

- [ ] `rg -n "fileRequest|RequestFull|RequestNotFound" apps/api/src/deliveries.ts` returns nothing
- [ ] `wc -l apps/api/src/deliveries.ts` is at most 720
- [ ] `vp check`, `vp run test` exit 0

## STOP conditions

- Moving `explain` changes which error the uploader sees in any existing test.
- `place` needs the request row type: pass the minimum (ids and numbers), never the row.

## Maintenance notes

The next file-request rule (per-uploader caps, allowed file types) belongs in `FileRequests` as another `condition`; `Deliveries` should never learn the word "request" again.

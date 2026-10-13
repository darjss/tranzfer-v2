# Plan 09: Give `uploads.ts` one per-transfer ledger and move the transport policy out of it

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval (new _source_ files named below are fine; editing import lines in `uploads.test.ts` is in scope). Work in a worktree off current `origin/dev`. Three PRs: A (transport), B (ledger), C (typed failure). This is upload-reliability code: read `docs/RELIABILITY.md` first and change no behavior in A and B.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/web/src/uploads apps/web/src/downloads/save-folder.ts apps/web/src/dashboard/deliveries.ts apps/web/src/api/errors.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M + M + S | **Risk**: MED (A: LOW) | **Depends on**: plan 08 (touches `retry()` in `uploads.ts`) | **Category**: tech-debt (deepening: locality)
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`apps/web/src/uploads/uploads.ts` is 1,038 lines, one `make` closure of ~750 lines (`:275-1030`). The service interface is small and good (`{ cancel, restore, resume, retry, send }`, `:1029`), and the Uppy engine wiring is the real depth and should stay together. Three things are not deep:

1. **Per-transfer state is spread over six parallel maps keyed by `TransferId`** (`:284-299`): `acks`, `keys`, `uploadIdStored`, `completeSigned`, `autoRetries`, `doneParts`. The same cleanup is hand-copied at `:411-423` (`settled`), `:713-725` (queue failure) and `:798-805` (`cancel`), and each copy forgets a different subset (for example `settled` never clears `keys` or `uploadIdStored`, so they grow for the life of the tab). A new per-transfer field needs seven edits. 31 lines touch these maps.
2. **Transport policy lives in the upload engine but serves three features.** `retryTransport`, `untilOnline`, `retryWhileNotUploaded` and the constants (`:162-210`) are imported by `dashboard/deliveries.ts:24` and `downloads/save-folder.ts:8` from `uploads/uploads.ts`, and `save-folder.ts:64-65,269-273` re-implements the same capped exponential schedule (`RETRY_CAP`, `MAX_RETRIES`). `basename` exists three times (`uploads.ts:239`, `save-folder.ts:67`, `downloads/Previews.tsx:36`).
3. **Upload failures are untyped.** `TransferProgress.error` is `unknown` (`uploads/store.ts`), the engine stores Uppy's raw error (`uploads.ts:588-593`), and `appError` (`api/errors.ts:197`) maps anything that is not an `ApiError` to "Something went wrong. Try again.", although `uploads.ts:216-237` already classifies the cases (404 = the multipart upload is gone and must never restart silently, 403 = expired signature, `NETWORK`, 5xx).

## Target design

- `apps/web/src/api/transport.ts` (new source file): `untilOnline`, `retryTransport`, `retryWhileNotUploaded`, a shared `transportSchedule` (capped exponential, 40 tries, 30 s cap) used by both `retryTransport` and `save-folder.ts`, and `basename`. `uploads.ts`, `dashboard/deliveries.ts`, `downloads/*` import from it.
- `apps/web/src/uploads/ledger.ts` (new source file), module-level (not Solid state, like `store.ts` is module state so uploads survive navigation): one `Map<TransferId, Entry>` with `Entry = { objectKey; acks; autoRetries; completeSigned; doneParts; uploadId }`, and the small interface `ledger.start(transferId, objectKey)`, `ledger.of(transferId)`, `ledger.idOfKey(objectKey)`, `ledger.forget(transferId)`. The three cleanup copies become `ledger.forget(id)` plus the `patchTransfer`/`letGo` calls they already make.
- `UploadFailed` (`Data.TaggedError`, in `uploads/failure.ts` or beside `isTransientUploadError`) with `reason: "gone" | "denied" | "network" | "unknown"` and optional `status`; `TransferProgress.error` becomes `ApiError | UploadFailed | undefined`; `api/errors.ts` `words` gets an `UploadFailed` branch (copy to be reviewed by the founder: keep it to one sentence each, per docs/SOUL.md).

## Current state (key excerpts)

`uploads.ts:284-299` (the six maps, each with a one-line comment); `:411-423`:

```ts
const settled = (uppy, fileId, transferId) =>
  Effect.gen(function* settle() {
    yield* spans.endFile(transferId, "done", {
      "upload.parts_confirmed": doneParts.get(transferId)?.size,
    });
    patchTransfer(transferId, { bytesPerSecond: 0, phase: "done" });
    completeSigned.delete(transferId);
    autoRetries.delete(transferId);
    doneParts.delete(transferId);
    uppy.removeFile(fileId);
    yield* forget([transferId]);
    letGo(transferId);
  });
```

`:713-725` and `:798-805` repeat `keys.delete(...)`, `completeSigned.delete`, `autoRetries.delete`, `patchTransfer(... "cancelled")`, `letGo`. `uploads.test.ts` imports `retryTransport` and other helpers from `./uploads` (lines 28 ff.) and tests them as pure functions.

## Commands you will need

| Purpose   | Command                               | Expected |
| --------- | ------------------------------------- | -------- |
| Check     | `vp check`                            | exit 0   |
| Tests     | `vp run test`                         | pass     |
| Web build | `vp run --filter @tranzfer/web build` | exit 0   |

## Scope

**A**: `api/transport.ts` (new), `uploads/uploads.ts`, `dashboard/deliveries.ts`, `downloads/save-folder.ts`, `downloads/Previews.tsx` (basename), import lines of `uploads/uploads.test.ts`.
**B**: `uploads/ledger.ts` (new), `uploads/uploads.ts`.
**C**: `uploads/uploads.ts`, `uploads/store.ts`, `api/errors.ts`, `dashboard/DeliverySheet.tsx` (the two `appError(progress().error)` call sites, which need no change if `appError` accepts the new union).
**Out of scope**: Uppy configuration, part concurrency (`PART_CONCURRENCY`), recovery.ts persistence, spans, the verify worker, `resume()` restructuring (it is long, but its natural cut is a `verifyResume` function; leave that for a later plan after B).

## Steps

**PR A**

1. Create `api/transport.ts` and move the four exports plus constants verbatim. Update imports in the three consumers and the test file. **Verify**: `vp check`, `vp run test` (`uploads.test.ts` must pass unchanged apart from the import path).
2. In `save-folder.ts` replace the inline `Schedule.exponential(...).pipe(modifyDelay(...))` and `RETRY_CAP`/`MAX_RETRIES` with the shared `transportSchedule`; keep its own `isTransient` predicate. **Verify**: `SaveAll.test.tsx` passes.
   **PR B**
3. Add `ledger.ts`. Migrate one map per commit (`doneParts`, `acks`, `autoRetries`, `completeSigned`, `keys` + `uploadIdStored`). After each: `vp check`, `vp run test`.
4. Replace the three cleanup sequences with `ledger.forget(id)`. This makes `settled` also forget `keys` and `uploadId`, which is the intended fix for the leak; call it out in the PR description.
   **PR C**
5. Add `UploadFailed`; create it in the `upload-error` handler (`:588-593`, from the existing `s3Error` status/code classification) and in `listRemoteParts` (`:379-388`); type the store field; add the `words` branch in `errors.ts`. The `Match.tagsExhaustive` in `errors.ts:140` will fail to compile until the branch exists, which is the check. Existing `isTransientUploadError` stays the retry decision.

## Test plan

No new test files without approval. Existing: `uploads.test.ts` (pure helpers, retry policy), `dashboard.test.tsx` (the reactivity budget: one progress tick must recompute only the moving row; run it after B because `patchTransfer` call sites move), `SaveAll.test.tsx`. If the executor wants a ledger test (forget clears every field), ask for approval first; it is a pure data test.

## Done criteria

- [ ] A: `rg -n "from \"../uploads/uploads\"" apps/web/src/dashboard apps/web/src/downloads` shows only `Uploads` service imports, no transport helpers
- [ ] B: `rg -n "new Map<TransferId|new Set<TransferId" apps/web/src/uploads/uploads.ts` returns nothing; `wc -l apps/web/src/uploads/uploads.ts` is at least 40 lines shorter
- [ ] C: `rg -n "error: unknown" apps/web/src/uploads/store.ts` returns nothing
- [ ] each PR: `vp check`, `vp run test`, web build exit 0

## STOP conditions

- Any change to when a transfer is retried, finalized or forgotten that the existing tests do not cover and the plan does not describe.
- The dashboard reactivity budget regresses (any new diagnostic or extra reruns).
- Moving `retryTransport` changes its identity in the test (it is exported and tested as a function; keep behavior bit-for-bit).

## Maintenance notes

New per-transfer facts go in `Entry`, never in a new map. `ledger.forget` is the only place a transfer's in-memory state ends. Reviewers: check that `completeSigned` is still set before `Complete` is signed (law 5/7 in RELIABILITY.md).

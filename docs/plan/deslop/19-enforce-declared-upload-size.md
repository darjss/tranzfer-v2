# Plan 19: Make the bytes in R2 match the size the sender declared and was charged for

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. Step 2 changes what the browser must send: it needs a staging experiment and the founder's go-ahead before merge. No new test files without approval. Work in a worktree off current `origin/dev`. Read `docs/RELIABILITY.md` first.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/transfers.ts apps/api/src/infrastructure/r2.ts apps/api/src/storage.ts packages/contracts/src/upload.ts apps/web/src/uploads/uploads.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S (step 1) + M (step 2, with an experiment) | **Risk**: LOW (1), MED (2) | **Depends on**: none | **Category**: security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

A delivery is charged against the plan by the sizes the client _declares_ at create (`deliveries.ts` `activeBytesAt`, `withinLimits`). The presigned upload URLs do not pin the body length: `r2.ts:30-60` signs `if-none-match` for `Put` and nothing for `Part`. So a Free user (20 GB) can declare one byte and PUT up to 5 GiB, or send up to 10,000 parts of up to 5 GiB each. Through a file request link this needs no account at all. The check comes only at finalize (`transfers.ts:44-58` `verify`): a size mismatch returns `InvalidUpload` and **leaves the object in place**. For a single PUT it also traps the transfer: a retry re-signs a create-only PUT, R2 answers 412, the client treats that as "already landed" (`putAlreadyLanded`, `uploads.ts:237`), finalizes, and gets `InvalidUpload` again; `recoverFinalizing` only `touch`es the row (`transfers.ts:260-268`). The junk object survives until the 7-day abandon cancel and the purge.

`docs/RELIABILITY.md:269` records the late check as a decision ("a client that uploads more than it declared is only caught at the end"). This plan keeps that decision for the check itself; it changes what happens at the end (the object is deleted, not kept) and, as an optional second step, closes the gap at the source. If the founder prefers to keep the documented behavior, do step 1 only and update that sentence to say the object is removed.

## Current state

`apps/api/src/transfers.ts:44-58`:

```ts
const verify = (transfer: Transfer, object: Option.Option<StoredObject>) =>
  Match.value(object).pipe(
    Match.when(Option.isNone, () => Effect.fail(new NotUploaded())),
    Match.when(
      (found) => Option.isSome(found) && found.value.size !== transfer.size,
      (found) => Effect.logError("uploaded size does not match", { ... }).pipe(Effect.andThen(Effect.fail(new InvalidUpload()))),
    ),
    Match.orElse((found) => Effect.succeed(found.value)),
  );
```

`settle` (`:162-176`) calls `verify` twice around `storage.seal`. `Storage.purge(prefix, keys)` aborts multipart uploads under a prefix and deletes keys, "safe to repeat" (`storage.ts`). Client part size is deterministic: `getChunkSize: ({ size }) => partSize(size)` (`uploads.ts:460`), `partSize`/`partCount` in `contracts/src/upload.ts:6-9`; every part is `partSize(size)` bytes except the last.

## Commands you will need

| Purpose      | Command                                | Expected                        |
| ------------ | -------------------------------------- | ------------------------------- |
| Check        | `vp check`                             | exit 0                          |
| Tests        | `vp run test`                          | pass                            |
| Staging e2e  | `vp run test:e2e` against a PR preview | pass                            |
| Upload bench | see `bench/upload` (10 GiB on staging) | completes, same speed within 5% |

## Scope

**Step 1**: `apps/api/src/transfers.ts`. **Step 2**: `apps/api/src/infrastructure/r2.ts` (header map per request), `apps/api/src/storage.ts` if the signature needs the transfer size, `apps/api/src/transfers.ts` (`sign` passes the size).
**Out of scope**: quota accounting by real bytes (a bigger change; this plan makes declared equal real), R2 lifecycle rules.

## Steps

1. **Delete a mismatched object.** In `settle`, when `verify` finds a size that differs (the `InvalidUpload` branch), call `storage.purge(objectPrefix, [transfer.objectKey])` before failing, and reset the transfer to `uploading` only if it was `finalizing` and the purge succeeded, so a correct re-upload can start (a create-only PUT works again once the key is gone). Keep `NotUploaded` as is. Because `verify` is a pure function today, either split the mismatch branch out into `settle`, or let `verify` return a tagged result; choose the smaller diff. **Verify**: `vp run test` (transfers tests that cover `InvalidUpload`); add no assertions.
2. **Pin the length in the signature (experiment first).**
   a. In `r2.ts` `uploadRequest`, for `Put` add `"content-length": String(size)` to `headers`, and for `Part` add the part's exact length: `Math.min(partSize(size), size - (partNumber - 1) * partSize(size))`. `uploadRequest` needs the transfer size; `Storage.signUpload(key, request)` gets a third argument (`size: number`) and `Transfers.sign` passes `transfer.size` (it already has the row at `transfers.ts:300`).
   b. The browser must send exactly those headers; the API already returns them in `SignedUrl.headers` and Uppy forwards them (`r2.ts` "headers are part of the signature", `contracts/src/upload.ts:53`). `Content-Length` is a forbidden request header in browsers, so the browser sets it from the body, which has the same value. Confirm Uppy does not throw on the forbidden header.
   c. On a PR preview run `bench/upload` for a 1 GiB file and a 0-byte, 1-byte and 65 MiB file, plus a deliberately oversized PUT with `curl` against a signed URL (use a staging test user; never log the URL). Expected: correct sizes pass; the oversized PUT is rejected by R2 with a signature error. If R2 does **not** reject (it ignores the signed `content-length`), STOP and report: step 1 is then the whole fix.
   d. A 403 from R2 is treated as transient by the client (`isTransientUploadError`, `uploads.ts:222-235` retries 403 up to 40 times with backoff): confirm a size mismatch bug in the client would surface as a visible failure and not a silent 40-retry loop; if it would loop, STOP and ask.

## Test plan

No new test files. Step 1 relies on the existing finalize/size-mismatch coverage in `apps/api/test/transfers.test.ts`. Step 2 is verified by the staging experiment above; the memory storage fake (`apps/api/test/support.ts`) ignores headers, so no test change is needed (check that its `signUpload` signature change compiles).

## Done criteria

- [ ] `vp check`, `vp run test` exit 0
- [ ] After step 1, a mismatched object is gone from R2 (list the prefix on staging) and a re-upload succeeds
- [ ] After step 2, an oversized PUT to a signed URL is rejected, and the 10 GiB bench is within 5% of baseline

## STOP conditions

- R2 ignores signed `content-length` (step 2c).
- The browser upload engine sends a different part length than `partSize` for any file (for example a resumed upload created by an older client version: resumed multipart uploads keep their old part size, `uploads.ts:936`, `record.partSize === partSize(file.size)`); in that case only sign the exact length when the transfer is new.

## Maintenance notes

If `partSize` changes (the comment at `contracts/src/upload.ts:6` says 64 MiB stands until the 10 GB gate), uploads in flight keep the old size; the server must derive the expected part length from the same function the client used for that upload, so record the part size per transfer before changing it.

# Plan 19: Make the bytes in R2 match the size the sender declared and was charged for

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. Step 2 changes what the browser must send: it needs a staging experiment and the founder's go-ahead before merge. No new test files without approval. Work in a worktree off current `origin/dev`. Read `docs/RELIABILITY.md` first.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/transfers.ts apps/api/src/infrastructure/r2.ts apps/api/src/storage.ts packages/contracts/src/upload.ts apps/web/src/uploads/uploads.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M (step 2, with an experiment; step 1 done) | **Risk**: MED | **Depends on**: none | **Category**: security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

A delivery is charged against the plan by the sizes the client _declares_ at create (`deliveries.ts` `activeBytesAt`, `withinLimits`). The presigned upload URLs do not pin the body length: `r2.ts` `uploadRequest` signs `if-none-match` for `Put` and nothing for `Part`. So a Free user (20 GB) can declare one byte and PUT up to 5 GiB, or send up to 10,000 parts of up to 5 GiB each. Through a file request link this needs no account at all.

Step 1 is done: finalize's `verify` (`transfers.ts`, inside the `Transfers` layer) now purges a wrong-size object and moves a `finalizing` transfer back to `uploading`, so the junk no longer sits in R2 until the 7-day cleanup. The oversized bytes still cross the wire and are stored until the browser calls finalize. Step 2 closes the gap at the source by signing the exact length.

## Current state

Client part size is deterministic: `getChunkSize: ({ size }) => partSize(size)` (`uploads.ts`), `partSize`/`partCount` in `contracts/src/upload.ts`; every part is `partSize(size)` bytes except the last. `Storage.signUpload(key, request)` takes no size today.

## Commands you will need

| Purpose      | Command                                | Expected                        |
| ------------ | -------------------------------------- | ------------------------------- |
| Check        | `vp check`                             | exit 0                          |
| Tests        | `vp run test`                          | pass                            |
| Staging e2e  | `vp run test:e2e` against a PR preview | pass                            |
| Upload bench | see `bench/upload` (10 GiB on staging) | completes, same speed within 5% |

## Scope

**Step 2**: `apps/api/src/infrastructure/r2.ts` (header map per request), `apps/api/src/storage.ts` if the signature needs the transfer size, `apps/api/src/transfers.ts` (`sign` passes the size).
**Out of scope**: quota accounting by real bytes (a bigger change; this plan makes declared equal real), R2 lifecycle rules.

## Steps

2. **Pin the length in the signature (experiment first).**
   a. In `r2.ts` `uploadRequest`, for `Put` add `"content-length": String(size)` to `headers`, and for `Part` add the part's exact length: `Math.min(partSize(size), size - (partNumber - 1) * partSize(size))`. `uploadRequest` needs the transfer size; `Storage.signUpload(key, request)` gets a third argument (`size: number`) and `Transfers.sign` passes `transfer.size` (it already has the row; `storage.signUpload` is at `transfers.ts:402`).
   b. The browser must send exactly those headers; the API already returns them in `SignedUrl.headers` and Uppy forwards them (`r2.ts` "headers are part of the signature", `contracts/src/upload.ts:53`). `Content-Length` is a forbidden request header in browsers, so the browser sets it from the body, which has the same value. Confirm Uppy does not throw on the forbidden header.
   c. On a PR preview run `bench/upload` for a 1 GiB file and a 0-byte, 1-byte and 65 MiB file, plus a deliberately oversized PUT with `curl` against a signed URL (use a staging test user; never log the URL). Expected: correct sizes pass; the oversized PUT is rejected by R2 with a signature error. If R2 does **not** reject (it ignores the signed `content-length`), STOP and report: step 1 is then the whole fix.
   d. A 403 from R2 is treated as transient by the client (`isTransientUploadError`, `uploads.ts:184`, retried at `:514`, retries 403 up to 40 times with backoff): confirm a size mismatch bug in the client would surface as a visible failure and not a silent 40-retry loop; if it would loop, STOP and ask.

## Test plan

No new test files. Step 2 is verified by the staging experiment above; the memory storage fake (`apps/api/test/support.ts`) ignores headers, so no test change is needed (check that its `signUpload` signature change compiles).

## Done criteria

- [ ] `vp check`, `vp run test` exit 0
- [ ] After step 2, an oversized PUT to a signed URL is rejected, and the 10 GiB bench is within 5% of baseline

## STOP conditions

- R2 ignores signed `content-length` (step 2c).
- The browser upload engine sends a different part length than `partSize` for any file (for example a resumed upload created by an older client version: resumed multipart uploads keep their old part size, `uploads.ts:957`, `record.partSize === partSize(file.size)`); in that case only sign the exact length when the transfer is new.

## Maintenance notes

If `partSize` changes (the comment at `contracts/src/upload.ts:6` says 64 MiB stands until the 10 GB gate), uploads in flight keep the old size; the server must derive the expected part length from the same function the client used for that upload, so record the part size per transfer before changing it.

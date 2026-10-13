# Plan 06: Make the RPC surface say each thing once

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval. Work in a worktree off current `origin/dev`. Two PRs; PR B is optional and needs the founder's go-ahead (see its note).
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- packages/contracts/src apps/api/src/rpc.ts apps/api/src/infrastructure/auth.ts apps/web/src/dashboard/deliveries.ts apps/web/src/routes/deliveries.tsx e2e/gates/upload.test.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 (PR A), P3 (PR B) | **Effort**: S + S | **Risk**: LOW | **Depends on**: plan 05 (token types) for PR A step 2 only; otherwise none | **Category**: tech-debt (API design)
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`packages/contracts/src/api.ts` is the single source of truth for the wire, and it is mostly good: every operation has a payload, a success and a typed error union. Four things drift:

1. **Error unions are re-typed per variant.** The owner and the token-bound uploader calls share most errors but spell them out separately: `SignUpload` (`api.ts:114-118`: `DeliveryNotFound, InvalidUpload, RateLimited, UploadClosed`) vs `SignRequestUpload` (`:161-171`: the same four plus `RequestNotFound`); `FinalizeTransfer` (`:119-129`) vs `FinalizeRequestTransfer` (`:172-184`); `CreateDelivery` (`:65-75`) vs `CreateRequestUpload` (`:150-160`). 13 `Schema.Union([...])` blocks in the file. The service interfaces then copy them again (`file-requests.ts:100-125`, `transfers.ts:83,90`).
2. **`JoinInterest` re-implements the auth middleware by hand.** `rpc.ts:81-96` reads the session itself, maps errors, and branches on `principal`, bypassing `AuthenticatedLive` (so a renewed session cookie is dropped on this path, `rpc.ts:23-45`). The contract (`api.ts:206-210`) exposes `AuthenticationUnavailable` and `Unauthorized` on a "public" operation, and the web uses `Unauthorized` as control flow (`apps/web/src/landing/Pricing.tsx:101`).
3. **Client IP plumbing is copied seven times.** `clientIp(new Headers(headers))` appears 7 times in `rpc.ts` (`:69,75,95,100,105,113,119`), plus `auth.ts:263`. Handlers are meant to be "one-line" (`docs/STRUCTURE.md` "Adding an operation").
4. **Naming.** Lists are bare nouns (`Deliveries`, `FileRequests`, `DeliveryEmails`), the one getter is `GetBilling`, identity is `Me`. Only 5 call sites use them (`apps/web/src/dashboard/deliveries.ts` x3, `routes/deliveries.tsx` x1, `e2e/gates/upload.test.ts` x2).

## Current state (key excerpts)

`apps/api/src/rpc.ts:79-96`:

```ts
JoinInterest: ({ email, plan }, { headers }) =>
  Effect.gen(function* joinInterest() {
    const who =
      email === undefined
        ? yield* auth.session(new Headers(headers)).pipe(
            Effect.mapError(() => new AuthenticationUnavailable()),
            Effect.flatMap(({ principal }) =>
              Option.match(principal, {
                onNone: () => Effect.fail(new Unauthorized()),
                onSome: (user) => Effect.succeed({ email: user.email, userId: user.id }),
              }),
            ),
          )
        : { email, userId: null };
    return yield* emails.joinInterest({ ...who, plan }, clientIp(new Headers(headers)));
  }),
```

`rpc.ts:23-45` `AuthenticatedLive` does the same lookup plus `HttpEffect.appendPreResponseHandler` for renewed cookies.

## Commands you will need

| Purpose   | Command                               | Expected |
| --------- | ------------------------------------- | -------- |
| Check     | `vp check`                            | exit 0   |
| Tests     | `vp run test`                         | pass     |
| Web build | `vp run --filter @tranzfer/web build` | exit 0   |

## Scope

**PR A**: `packages/contracts/src/api.ts` (+ `upload.ts`/`request.ts` only to export the shared fragments), `apps/api/src/rpc.ts`, `apps/api/src/infrastructure/auth.ts` (`clientIp` signature).
**PR B (rename)**: `api.ts`, `rpc.ts`, the five web/e2e call sites, `docs/*.md` mentions (`rg -n "Deliveries\b" docs README.md`).
**Out of scope**: payload shapes, error classes, the service interfaces, new tests.

## Steps

PR A

1. In `api.ts` define the shared fragments once, above `Api`:
   ```ts
   const uploadErrors = [DeliveryNotFound, InvalidUpload, RateLimited, UploadClosed] as const;
   const finalizeErrors = [...uploadErrors, NotUploaded, StorageUnavailable] as const;
   ```
   and use `Schema.Union([...uploadErrors, RequestNotFound])` etc. Confirm with `vp check` that the resulting `Rpc.Error` types are unchanged: add no annotations, compare by running `vp check` (the web `ApiError` type at `apps/web/src/api/errors.ts:42` and its exhaustive `Match` at `:140` fail to compile if a tag disappears).
2. Make `clientIp` accept Effect's `Headers` (what the RPC handler context provides) so `rpc.ts` calls `clientIp(headers)`; keep a thin overload only if `auth.ts:227,263` need the web `Headers` (check; otherwise convert once there).
3. Replace the manual session block in `JoinInterest` by a shared local `signedIn = (headers) => ...` that `AuthenticatedLive` also uses (extract the lookup + error mapping into one function in `rpc.ts`; do not add a new file). Behavior must stay: no email + signed out => `Unauthorized`; no email + session store down => `AuthenticationUnavailable`.
   **Verify**: `vp check`, `vp run test`, web build.

PR B (only with the founder's approval; it is a wire rename, no compatibility shim, web and API deploy together) 4. Rename `Deliveries`→`ListDeliveries`, `FileRequests`→`ListFileRequests`, `DeliveryEmails`→`ListDeliveryEmails`, `Me`→`GetMe`. Update `rpc.ts` handler keys, the five call sites, docs.
**Verify**: `rg -n "\.(Deliveries|FileRequests|DeliveryEmails|Me)\(" apps e2e bench` returns nothing; `vp check`, tests, web build.

## Test plan

No new files. `apps/web/src/dashboard/dashboard.test.tsx` and `SaveAll.test.tsx` use `RpcTest.makeClient(Api)`, so a rename or a changed error union breaks them at compile time, which is the check.

## Done criteria

- [ ] PR A: `rg -c "clientIp\(new Headers" apps/api/src/rpc.ts` returns 0; `rg -n "Schema.Union\(\[" packages/contracts/src/api.ts | wc -l` drops by at least 5
- [ ] `vp check`, `vp run test`, web build exit 0

## STOP conditions

- The error type of any RPC changes (compare the `Rpc.Error` of each affected operation before/after).
- Fixing `JoinInterest` would need a contract change (do not change its payload or error list in this plan; note that dropping the two auth errors from the public contract is a follow-up that touches `Pricing.tsx`).

## Maintenance notes

New owner/token variants should compose `uploadErrors`/`finalizeErrors`. A larger redesign (a `RequestAccess` RPC middleware that reads the token from a header so the `token` field leaves seven payloads) is deliberately not proposed: it adds a concept for little gain while the file-request web UI does not exist yet.

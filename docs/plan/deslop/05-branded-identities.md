# Plan 05: Brand the user id and the link/unlock tokens end to end

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval. Work in a worktree off current `origin/dev`. This is two PRs; land PR A before starting PR B.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- packages/contracts packages/db/src apps/api/src apps/api/test/support.ts apps/web/src/downloads apps/web/src/routes/d`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M (A: ~250 lines, mostly type annotations; B: ~120 lines) | **Risk**: LOW (compile-time only) | **Depends on**: none | **Category**: tech-debt (type safety)
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

The repo brands `DeliveryId`, `TransferId`, `RequestId` (`packages/contracts/src/delivery.ts:4,7`, `request.ts:13`) and drizzle columns carry them via `$type<>()` (`schema.ts:124,149,191`). Three kinds of value that mix easily are still plain `string`:

- the user id: `Principal.id: Schema.String` (`contracts/src/auth.ts:8`), and `senderId: string` / `ownerId: string` / `userId: string` parameters at 53 sites in `apps/api/src` (`deliveries.ts` 23, `transfers.ts` 6, `plans.ts` 6, `file-requests.ts` 6, `emails.ts` 6, `billing.ts` 6). `deliveries.owned(senderId, deliveryId)` and `userPlans.current(userId)` accept any string, including a delivery id.
- the link token: `token: Schema.String` in `api.ts:147,215,223,233`, `request.ts:75,94,98`, `upload.ts:50`.
- the unlock token: `unlock: Schema.optional(Schema.String)` in `api.ts:215,234` and `Unlocked.unlock` (`link.ts:50`).
  The web passes `{ token, unlock }` around as loose strings (`save-folder.ts:214` declares its own `{ readonly token: string; readonly unlock: string | undefined }`, `SaveAll.tsx:40`, `Unlock.tsx:17`, `routes/d/[token].tsx:148,302`), a hand-written copy of what the contract already says.

## Target design

In `packages/contracts`:

```ts
// auth.ts
export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;
// Principal.id: UserId
// link.ts
export const LinkToken = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand("LinkToken"));
export const UnlockToken = Schema.String.pipe(Schema.brand("UnlockToken"));
/** What anyone holding a link sends: its token, plus the unlock when it has a password. */
export const LinkAccess = Schema.Struct({ token: LinkToken, unlock: Schema.optional(UnlockToken) });
export type LinkAccess = typeof LinkAccess.Type;
```

Check the installed Effect for the exact names (`Schema.isNonEmpty` vs `Schema.isMinLength(1)`; `request.ts:13` uses `Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("RequestId"))`; copy that form). Use `type X = typeof X.Type` (CONVENTIONS.md "Types come from values").

## Current state (key excerpts)

`packages/contracts/src/api.ts:211-236` (OpenLink / UnlockLink / ReportDownload payloads each spell `token`/`unlock` by hand). `packages/contracts/src/request.ts:73-99` (`NewRequestUpload.token`, `RequestUploadsPayload.token`, `RequestTransferPayload.token`), `upload.ts:47-51` (`SignRequestUploadPayload.token`). `apps/api/src/link-tokens.ts` `issue(linkId: string): Effect<string>`, `verify(token: string)`, `issueUnlock(...)`: `{ expiresAt, unlock: string }`, `verifyUnlock(unlock: string, ...)`. `apps/api/src/infrastructure/auth.ts:289-294` builds the principal from Better Auth's user (`id: user.id`). `packages/db/src/schema.ts`: `user.id` (line 22), FKs `session.userId` 62, `account.userId` 75, `fileRequest.ownerId` 125, `delivery.senderId` 151, `subscription.userId` 264, `planGrant.userId` 305, `planInterest.userId` 330.

## Commands you will need

| Purpose   | Command                               | Expected |
| --------- | ------------------------------------- | -------- |
| Check     | `vp check`                            | exit 0   |
| Tests     | `vp run test`                         | pass     |
| Web build | `vp run --filter @tranzfer/web build` | exit 0   |

## Scope

**PR A (UserId)**: `packages/contracts/src/auth.ts`, `packages/db/src/schema.ts` (`$type<UserId>()` on `user.id` and the FK columns listed), `apps/api/src/*.ts` params, `apps/api/src/infrastructure/auth.ts`, `apps/api/test/support.ts` (`addUser` builds `UserId.make(id)`), `apps/api/scripts/*.ts` if they typecheck against it.
**PR B (tokens)**: `packages/contracts/src/{link,api,request,upload}.ts`, `apps/api/src/{link-tokens,shared-links,file-requests}.ts`, `apps/web/src/downloads/*`, `apps/web/src/routes/d/[token].tsx`.
**Out of scope**: the token wire format (unchanged: `${linkId}.${hmac}`), `Principal` fields other than `id`, Better Auth's own tables' behavior, any new test file.

## Steps

PR A

1. Add `UserId`; change `Principal.id`. Add `$type<UserId>()` to the columns above (type-only, no migration; verify `drizzle-kit generate` reports no change).
2. In `Auth.session` (`auth.ts:289`) construct `UserId.make(user.id)`: the one place a raw Better Auth string becomes a `UserId` (add a comment: Better Auth owns id generation).
3. Change every `senderId: string` / `ownerId: string` / `userId: string` in `apps/api/src` to `UserId`. Let the compiler list the sites. `billing.ts` hands `userId` to Polar as `external_customer_id` (a string), which is assignable. `Emails.sendDelivery`'s `sender: { id: string ... }` becomes `Principal` (it is already one structurally).
4. `apps/api/test/support.ts`: `addUser(id: string, ...)` inserts `UserId.make(id)` and callers keep passing strings.
   **Verify**: `vp check`, `vp run test`.

PR B 5. Add `LinkToken`, `UnlockToken`, `LinkAccess`. Replace the hand-written fields in `OpenLink` and `ReportDownload` payloads with `...LinkAccess.fields` (keep `event`, `path`); `UnlockLink` uses `token: LinkToken`; request/upload payloads use `token: LinkToken`; `Unlocked.unlock: UnlockToken`. 6. `link-tokens.ts`: `issue` returns `LinkToken`, `verify` takes `LinkToken`, `issueUnlock` returns `UnlockToken`, `verifyUnlock` takes `UnlockToken`. Branding happens inside this file at the only mint points (`${linkId}.${mac}` and `${expiresAt}.${mac}`) via `LinkToken.make(...)`. 7. Web: route params are strings at the router boundary: decode once in `routes/d/[token].tsx:403-432` with `Schema.decodeUnknownOption(LinkToken)` (or `LinkToken.make` if the file already treats a missing param as a 404); pass `LinkAccess` down instead of separate `token`/`unlock` props where it removes a prop (`SaveAll`, `save-folder.ts:214` drops its own type and takes `LinkAccess`).
**Verify**: `vp check`, `vp run test`, `vp run --filter @tranzfer/web build`.

## Test plan

No new test files. `apps/web/src/downloads/SaveAll.test.tsx` and `apps/api/test/shared-links.test.ts` build tokens and unlocks; update their construction to use the brand `make` (existing files, minimal edits).

## Done criteria

- [ ] `rg -n "(senderId|ownerId|userId): string" apps/api/src` returns nothing
- [ ] `rg -n "token: Schema.String" packages/contracts/src` returns nothing
- [ ] `vp check`, `vp run test`, web build exit 0
- [ ] drizzle-kit reports no schema change

## STOP conditions

- A `UserId.make` is needed anywhere other than `Auth.session`, test support and scripts: ask first (it means a raw string is crossing a boundary unreviewed).
- Better Auth's drizzle adapter fails type-checking against the branded `user.id`.
- Tokens already in the wild stop verifying (format must not change).

## Maintenance notes

Plan 12's lint rule flags new `userId: string`. Domain separation between link tokens and request tokens (both are `HMAC(id)` of the same key, `link-tokens.ts` `issue`) is not changed here because it would invalidate every shared link; revisit when file-request links ship.

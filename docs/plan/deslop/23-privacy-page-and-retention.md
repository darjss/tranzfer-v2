# Plan 23: Make the privacy page and the code agree about what is stored, and purge what has no purpose

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. Copy changes follow `docs/SOUL.md` and the writing rules in `AGENTS.md`/`docs/CONVENTIONS.md`; show the founder the new wording before merging. Do not read real user data: step 3 counts rows only. No new test files. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/web/src/routes/privacy.tsx packages/db/src/schema.ts apps/api/src/infrastructure/auth.ts apps/api/src/sweeper.ts docs/RELIABILITY.md README.md .env.example apps/api/src/resources.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S-M | **Risk**: LOW | **Depends on**: none (step 2 uses plan 01's `isolated` helper if it has landed) | **Category**: docs / security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`apps/web/src/routes/privacy.tsx:14` says "This page lists everything we store". It does not. The schema (`packages/db/src/schema.ts`) also holds:

- the client IP of every account creation (`signup` table, lines 39-46; rows are never deleted: `rg "delete.*signup" apps/api/src` finds nothing), kept for a 24-hour cap but retained forever;
- email addresses of people who joined the paid-plan waitlist, with or without an account (`plan_interest`, lines 323-341);
- the name and optional email of anyone who uploaded through a file request (`delivery.uploader_name`, `uploader_email`, lines 162-163);
- per-file download reports (`download`, lines 242-259);
- delivery-email rows (status and error code only, never the address: lines 348-367), access-code redemptions (`plan_grant`);
- the OAuth tokens: the `account` table has `access_token`, `refresh_token`, `id_token` (lines 78-80), and Better Auth stores them in plain text by default (`@better-auth/core` `init-options.d.mts`, `account.encryptOAuthTokens`: "By default, OAuth tokens ... are stored in plain text in the database ... @default false"). The app only signs in with Google and never calls Google on the user's behalf, so it needs none of them.
  Smaller drift found in the same pass: `docs/RELIABILITY.md:269` says "Two creates racing past the limit both succeed, and the next create sees both", but `Deliveries.place` enforces the limit inside the insert statement (`deliveries.ts:446-467`); `apps/api/src/resources.ts:56-60` says "No app-level expiry sweep exists yet" although `purgeEnded` runs every minute; `README.md:9` says `infra/.env`, but `infra/alchemy.run.ts:14-19` loads the repo-root `.env`; `README.md:19` says "web `/infra`", which no longer exists (the probe is the API's `/health`); `.env.example` has no `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`, which the README and CI need.

## Commands you will need

| Purpose   | Command                               | Expected |
| --------- | ------------------------------------- | -------- |
| Check     | `vp check`                            | exit 0   |
| Tests     | `vp run test`                         | pass     |
| Web build | `vp run --filter @tranzfer/web build` | exit 0   |

## Scope

**In scope**: `apps/web/src/routes/privacy.tsx`, `apps/api/src/infrastructure/auth.ts` (one option), `apps/api/src/sweeper.ts` and a new `Auth`/`signup` prune function in `infrastructure/auth.ts`, `docs/RELIABILITY.md` (one sentence), `apps/api/src/resources.ts` (one comment), `README.md`, `.env.example`.
**Out of scope**: account deletion, data export, cookie banners, legal review (flag it to the founder).

## Steps

1. **Privacy page.** Add one bullet to "What we store" for each item above that the page omits, in the same voice: signup IP and its 24 hours; waitlist email (kept until the plan opens and the one email is sent); uploader name and email (kept with the delivery); download reports; and say plainly that rate-limit counters use the IP and are not kept beyond the window. Change "lists everything we store" only if something is still left out after this; otherwise keep it, now true. Update "How long it lives" to match step 2.
2. **Retention.** Add `pruneSignups` (delete `signup` rows older than `rateLimits.newAccounts.windowSeconds` plus a day) in `infrastructure/auth.ts` next to `admitSignup`, and call it from `sweep` (`sweeper.ts`) wrapped like the other steps. Waitlist rows: the sweeper already marks them notified (`notifiedAt`); decide with the founder whether to delete the row after the opening mail (ask, then implement or write down "kept until you ask").
3. **OAuth tokens.** First count, read-only, on staging: `SELECT count(*) FROM account WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL` through the dashboard/`wrangler d1 execute --remote` for the staging database; record only the number. Then add `account: { encryptOAuthTokens: true }` to the `BetterAuth({...})` options (`infrastructure/auth.ts:206`), which encrypts with a key derived from `BETTER_AUTH_SECRET`; existing plain-text rows keep working (Better Auth decrypts only values it encrypted). If the product never needs the tokens, the stronger fix is to clear them in a Better Auth `databaseHooks.account.create.before` hook; ask the founder which.
4. **Stale text.** Fix the five drift items above with the smallest edits: the RELIABILITY sentence should say each create's limit check is part of the insert statement, and the late-size-check sentence stays (see plan 19); the `resources.ts` comment should name `Deliveries.purgeEnded`; README paths; add the two Cloudflare variables to `.env.example` with empty values.
5. **Verify**: `vp check`, `vp run test`, web build; open `/privacy` on the PR preview.

## Test plan

No new tests. `purgeEnded`-style sweep steps are covered by service tests; a `pruneSignups` call is a one-line delete by age, checked by running it on the staging database once and counting rows before/after.

## Done criteria

- [ ] `vp check`, `vp run test`, web build exit 0
- [ ] Every table in `schema.ts` that stores personal data appears on the privacy page or is explicitly listed as "not personal" in the PR
- [ ] `rg -n "No app-level expiry sweep" apps` returns nothing
- [ ] `signup` rows older than a day are deleted by the sweeper (staging row count shows it)

## STOP conditions

- The founder wants the legal wording reviewed first (privacy copy is a commitment).
- `encryptOAuthTokens` changes sign-in behavior for existing users on staging.

## Maintenance notes

Make "touch the privacy page" part of the checklist for any PR that adds a column holding an email, IP, name or token. A lint rule cannot do this; the PR template can.

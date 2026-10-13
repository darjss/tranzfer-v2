# Plan 22: Cap the confirmation email on the public waitlist, and bound sender-controlled text in delivery emails

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without approval. Work in a worktree off current `origin/dev`. Do step 1 and step 2 before asking about step 3.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/emails.ts apps/api/src/rpc.ts packages/contracts/src/billing.ts packages/contracts/src/interest.ts`. Changed (plan 07 moves `joinInterest` into `interest.ts`): follow the code to its new file; structural mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW | **Depends on**: none (plan 07 moves the code; either order works) | **Category**: security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`JoinInterest` is a public RPC (`api.ts:206-210`, "the pricing page asks before anyone has an account"). With an `email` in the payload it stores `(email, plan)` and, for a new pair, sends a confirmation from `hello@tranzfer.app` (`emails.ts:356-380`). The only limit is Cloudflare's per-IP binding `interestSignups`, 10 a minute (`contracts/src/billing.ts:62`), which is approximate, per location, and fails open. Ten a minute from one IP is 14,400 a day. The account's sending quota is 1,000 a day (`contracts/src/billing.ts:48-50`); delivery emails are capped at 800 a day account-wide (`emailsAccountPerDay`), and the comment says the rest is reserved for welcome and interest mail, but nothing counts interest mail. One script exhausts the quota, so delivery emails, welcome emails and the later "plan is open" mail fail, and every address it entered gets mail from our domain it did not ask for (up to three each, one per plan). `EmailAddress` is a loose regex (`interest.ts`) and its doc says "the confirmation email is the real check", but the email has no confirm link; it only offers "reply and we'll take you off the list".
Separately, a delivery email's subject and body use the sender's account name, the delivery title and the note (`emails.ts:69-92` `deliveryMessage`). Whitespace is normalized and HTML escaped, so there is no injection, but the name has no length limit (Better Auth lets a user set `name`; the Google name is also free text) and a sender can write a persuasive note with a link, sent from our domain, up to 50 a day on Free and 800 account-wide.

## Current state

`emails.ts` `joinInterest` (line ~356): rate-check via `options.allowInterest(ip)`; `db.insert(schema.planInterest).values({ email, plan, userId }).onConflictDoNothing().returning({ id })`; `if (added.length > 0) { yield* mail.send({ to: email, ...onTheList(...) }).pipe(Effect.catchTag("MailError", () => Effect.void)) }`. `deliveryMessage` builds `const name = sender.name.replaceAll(/\s+/gu, " ").trim() || sender.email;` and `subject: \`${name} sent you ${title}\``.

## Commands you will need

| Purpose | Command       | Expected |
| ------- | ------------- | -------- |
| Check   | `vp check`    | exit 0   |
| Tests   | `vp run test` | pass     |

## Scope

**In scope**: `apps/api/src/emails.ts` (or `interest.ts` after plan 07), `packages/contracts/src/billing.ts` (one new limit), `apps/web/src/api/errors.ts` only if a new `RateLimitName` is added (it is not, in the recommended design).
**Out of scope**: sign-in requirements, double opt-in, the sweeper's opening mail.

## Steps

1. **Cap the confirmation mail by the database, not the binding.** After the insert, send the confirmation only while the number of interest rows created in the last 24 hours is at most a new constant `interestMailsPerDay` (150: the 200 mails/day that `emailsAccountPerDay` leaves free, minus welcome mail). Use `db.$count(schema.planInterest, gt(schema.planInterest.createdAt, since))` (drizzle 1.0.0-rc.5 `SQLiteEffectCountBuilder`, an Effect). Over the cap the row is still stored, the response still succeeds, only the email is skipped; log one warning with the count. Put the constant next to `rateLimits` in contracts so the doc comment at `billing.ts:48-50` and the number stay together.
2. **Bound sender text.** In `deliveryMessage`, clip `name` to 60 characters for the subject and body (`Array.from(name).slice(0, 60).join("")`, so emoji are not cut mid-code-point) and clip `title` in the subject to 100 (the title keeps its full length in the body). Do not strip links from the note in this plan.
3. **Ask the founder (do not implement)**: should an unauthenticated visitor get a confirmation at all? Options: (a) keep, now capped; (b) send it only when the request is signed in (`userId` set), and just store anonymous joins; (c) double opt-in with a signed confirm link. Record the answer in the PR; implement only (a).
4. **Verify**: `vp check`, `vp run test`. Manually on a PR preview: call `JoinInterest` 3 times with distinct fake addresses (use the allowlist stage behavior, see `docs/PRODUCT.md`; previews hold mail for non-allowlisted addresses) and confirm rows are stored and the log shows no cap warning below the limit.

## Test plan

No new test files. `apps/api/test/deliveries.test.ts` covers join/openings and `deliveryMessage` output through `Emails`; the clipped name changes only strings longer than 60 characters, which existing fixtures do not use (check by running the suite).

## Done criteria

- [ ] `vp check`, `vp run test` exit 0
- [ ] `rg -n "interestMailsPerDay" packages apps` shows the contract constant and one use
- [ ] A 61-character sender name appears clipped in the email subject (check the string in a scratch call)

## STOP conditions

- A test depends on the confirmation being sent for the 151st address (it should not).
- The founder chooses (b) or (c): that is a separate, product-level plan.

## Maintenance notes

The daily quota is shared by welcome mail, interest mail, the opening mail (20 a minute from the sweeper, `OPENINGS_PER_SWEEP`) and delivery mail. Any new sender should join the same budget comment in `contracts/src/billing.ts`.

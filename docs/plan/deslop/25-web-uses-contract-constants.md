# Plan 25: The web reads limits and email codes from contracts, and the copy-button state exists once

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. Reactivity changes need the diagnostics checks in AGENTS.md. No new test files without approval. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- packages/contracts/src apps/web/src/dashboard apps/web/src/downloads/Unlock.tsx apps/api/src/emails.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P3 | **Effort**: S-M (~150 lines) | **Risk**: LOW | **Depends on**: none (plan 07 moves some email code; the constants below are unaffected) | **Category**: tech-debt
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`packages/contracts` is meant to be the one place the wire's rules live. Three rules are written again in the UI, and one UI state machine is written twice:

- **Password bounds.** `LinkPassword` is `Schema.String.check(Schema.isBetweenLength(8, 128))` (`contracts/src/link.ts:38`); the UI hard-codes `minlength={8}`, `maxlength={128}`, the text "8 to 128 characters" and `password().length < 8` (`dashboard/parts.tsx:371-391`), and `maxlength={128}` again in `downloads/Unlock.tsx:84`. `UnlockLink`'s payload repeats `isMaxLength(128)` in `api.ts` too.
- **Note and title length.** `maxTitleLength = 200` is exported (`delivery.ts:23`) but `SendDone.tsx:127` writes `maxlength={200}`; the 500 of `DeliveryNote` (`delivery.ts:46`) has no constant, and `SendDone.tsx:140` writes `maxlength={500}`.
- **Email error codes.** The API invents the codes `held` and `lost` (`apps/api/src/emails.ts` `refusal`/`failLost`/`sendDelivery`: `code: "held"`, `errorCode: "lost"`) and passes Cloudflare's `E_RECIPIENT_SUPPRESSED` through; the contract says only `errorCode: Schema.NullOr(Schema.String)` (`contracts/src/email.ts`), and `dashboard/format.ts:70-90` matches the same strings by hand. A new API code silently becomes "the mail server refused it".
- **Copy buttons.** `CopyLink` (`dashboard/parts.tsx:195-250`) and `CopyMessage` (`dashboard/SendDone.tsx:45-88`) each hold the same idle/copied/failed signal, timer, `onCleanup`, clipboard call and 1.8 s reset.

## Current state

See the lines above. `format.ts` `emailWords` (line ~78) is a chain of `if (row.errorCode === ...)`; both sides are plain strings today.

## Commands you will need

| Purpose   | Command                               | Expected |
| --------- | ------------------------------------- | -------- |
| Check     | `vp check`                            | exit 0   |
| Tests     | `vp run test`                         | pass     |
| Web build | `vp run --filter @tranzfer/web build` | exit 0   |

## Scope

**In scope**: `contracts/src/{link,delivery,email}.ts`, `apps/api/src/emails.ts` (use the constants), `apps/web/src/dashboard/{parts,SendDone,format}.ts(x)`, `apps/web/src/downloads/Unlock.tsx`.
**Out of scope**: wording of any message, the `appError` mapping, other dashboard duplication.

## Steps

1. Contracts: `export const passwordLength = { max: 128, min: 8 } as const;` in `link.ts` and use it in `LinkPassword` and in the `UnlockLink` payload; `export const maxNoteLength = 500;` in `delivery.ts` used by `DeliveryNote`; in `email.ts` `export const emailHeld = "held"` and `export const emailLost = "lost"` (the Cloudflare code stays a string; it is theirs), and use them in `apps/api/src/emails.ts`.
2. Web: replace the literals with the constants in `parts.tsx`, `Unlock.tsx`, `SendDone.tsx` (including the visible "8 to 128 characters" string, built from `passwordLength`), and `format.ts` (`emailWords`, `emailSummary`).
3. Copy state: extract one `createCopy(text: () => string)` returning `{ state, copy }` into `dashboard/parts.tsx` (the module that already owns `CopyLink`) and use it from both components. It must create its timer inside a component owner (`onCleanup`), as today. **Verify**: dashboard test with the reactivity budget still passes and `toHaveNoDiagnostics()` holds (`apps/web/src/dashboard/dashboard.test.tsx`).
4. `vp check`, `vp run test`, web build.

## Test plan

No new tests. `dashboard.test.tsx` renders the send-done card and the board, so copy buttons and the email words are exercised.

## Done criteria

- [ ] `rg -n "maxlength=\{(128|200|500)\}|minlength=\{8\}" apps/web/src` returns nothing
- [ ] `rg -n '"held"|"lost"' apps/web/src apps/api/src` returns only the contract file
- [ ] `vp check`, `vp run test`, web build exit 0

## STOP conditions

- The contract package's lib restricts something the constants need (it has no DOM or Node libs, see `delivery.ts:25`).
- A diagnostic code appears in the dashboard test.

## Maintenance notes

When a limit changes, change it in contracts only. Plan 16's R5 prevents the same drift for tokens; a similar rule for HTML attributes is not worth its noise.

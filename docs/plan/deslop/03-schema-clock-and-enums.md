# Plan 03: One definition each for the D1 clock default, the timestamp columns and the status enums

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- packages/db apps/api/src/plans.ts packages/contracts/src/delivery.ts packages/contracts/src/email.ts`. Changed = compare excerpts to live code; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S (~120 lines changed, mostly deletions) | **Risk**: LOW if the migration check in step 3 is empty | **Depends on**: none (plan 02 is independent) | **Category**: tech-debt
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`packages/db/src/schema.ts` writes the same default expression 16 times (`sql\`(cast(unixepoch('subsecond') * 1000 as integer))\``at lines 28, 31, 55, 90, 107, 110, 140, 175, 178, 207, 210, 233, 274, 294, 314, 332) and`apps/api/src/plans.ts:25`has it a 17th time as`databaseNow`. The `createdAt`/`updatedAt`column pairs are copy-pasted per table. The status enums are written twice: drizzle`enum: [...]`in the schema (lines 164, 201, 356) and`Schema.Literals` in contracts (`delivery.ts:77,80`, `email.ts:14`). A new state added to one place compiles everywhere that does not compare the two, and only fails at runtime or in the UI `Match`. One definition each removes that drift.

## Current state

`packages/db/src/schema.ts:21-34` (the first table, representative):

```ts
export const user = sqliteTable("user", {
  ...
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
```

Variants exist: `session.updatedAt` and `account.updatedAt` have no default (Better Auth supplies it); `signup.createdAt`, `fileRequest.expiresAt` have none; `deliveryEmail.createdAt` has none. Do not change columns that lack a default.

`apps/api/src/plans.ts:22-25`:

```ts
// The database's clock, in the integer milliseconds every timestamp column holds. ...
const databaseNow = sql`cast(unixepoch('subsecond') * 1000 as integer)`;
```

Contract enums: `packages/contracts/src/delivery.ts:77-81` (`DeliveryStatus` has 4 values; the table stores 3, `expired` is derived on read), `:80` `TransferState` (same 4 values as the table), `email.ts:14` `EmailStatus` (same 3 as the table).

Conventions: schema is Schema-first, drizzle columns use `$type<Brand>()` from contracts types (`schema.ts:124,149,191`). `packages/db` already depends on `@tranzfer/contracts` (package.json) and imports its types at `schema.ts:1-9`.

## Commands you will need

| Purpose         | Command                                                                                                                                                   | Expected            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Check           | `vp check`                                                                                                                                                | exit 0              |
| Tests           | `vp run test`                                                                                                                                             | pass                |
| Migration drift | `vp exec --filter @tranzfer/db drizzle-kit generate` (run in `packages/db`; if `vp exec` is not the right form use `pnpm --filter @tranzfer/db generate`) | "No schema changes" |

## Scope

**In scope**: `packages/db/src/schema.ts`, `packages/db/src/index.ts` (one export), `apps/api/src/plans.ts` (`databaseNow` import).
**Out of scope**: any generated migration (there must be none), columns without a default, the `check(...)` at `schema.ts:297`, contracts files (they are the source for the enums, not changed).

## Steps

1. In `schema.ts` add near the top, module-level:
   ```ts
   // D1 stamps rows in integer milliseconds; one expression for every default and for plans.ts.
   export const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
   ```
   Note the existing defaults wrap the expression in parentheses and `plans.ts` does not; keep each use byte-identical to today (export `nowMs` with parentheses for defaults and let `plans.ts` use `sql\`${nowMs}\``only if the rendered SQL stays valid; otherwise export two names:`nowMsDefault`and`nowMs`).
2. Add a `timestamps` spread for tables whose pair is exactly `createdAt` (default now, not null) + `updatedAt` (default now, `$onUpdate(() => new Date())`, not null): `user`, `delivery`, `transfer`, `verification`. Leave the others on a single shared `createdAt`/`created` helper only if that deletes lines without changing column definitions; otherwise skip them.
3. Replace the three `enum: [...]` arrays with the contract literals: `text("state", { enum: TransferState.literals })`, `text("status", { enum: EmailStatus.literals })`; for delivery use `enum: ["open", "ready", "cancelled"]` derived as `DeliveryStatus.literals.filter(...)` is a cast risk, so instead export from contracts `StoredDeliveryStatus = Schema.Literals(["open","ready","cancelled"])` and make `DeliveryStatus = Schema.Literals([...StoredDeliveryStatus.literals, "expired"])`. Check the installed Effect `Schema.Literals` accepts a spread of `literals`; if not, keep the delivery enum literal and add a one-line comment naming the contract it mirrors.
   **Verify**: run the migration drift command. Expected: no new migration generated. If drizzle-kit wants a migration, STOP (the SQL text or enum order changed).
4. `plans.ts`: import `nowMs` from `@tranzfer/db` (`export { nowMs } from "./schema"` in `packages/db/src/index.ts`; note `schema` is already exported as a namespace, so `schema.nowMs` works without touching `index.ts`). Delete the local `databaseNow`.
5. `vp check`, `vp run test`.

## Test plan

No new tests. `apps/api/test/*.test.ts` run against a freshly migrated local D1 (`packages/db/src/testing.ts`), so a bad default expression fails at insert time there.

## Done criteria

- [ ] `rg -c "unixepoch" packages apps --glob '!**/migrations/**'` shows exactly one match
- [ ] `rg -n 'enum: \[' packages/db/src/schema.ts` returns nothing for transfer state and email status
- [ ] drizzle-kit reports no schema change; `ls packages/db/migrations | wc -l` unchanged
- [ ] `vp check` and `vp run test` exit 0

## STOP conditions

- drizzle-kit generates a migration.
- Rendering `nowMs` inside `plans.ts` changes the SQL the existing redeem tests rely on.
- `Schema.Literals` cannot be spread; ask rather than casting.

## Maintenance notes

New tables use `...timestamps`. Dropping `$onUpdate` anywhere is a behavior change, not a cleanup. Reviewers: check the diff of the generated snapshot is empty.

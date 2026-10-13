# Plan 02: Replace hand-written SQL strings with Drizzle's query builder where it can express them

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without user approval. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src packages/db/src`. Any change in the files below: re-read the live lines against the excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M (one PR, ~200 lines touched) | **Risk**: MED (SQL semantics) | **Depends on**: none | **Category**: tech-debt
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

There are 26 lines with a `sql` template in `apps/api/src` (the 19 schema defaults in `packages/db` are plan 03). Four of them hard-code table and column names inside strings (`transfers.ts:196-197`, `deliveries.ts:669`, `deliveries.ts:775`, e.g. `FROM delivery WHERE delivery.id = transfer.delivery_id`). A column rename in `packages/db/src/schema.ts` compiles, passes typecheck, and fails only at runtime on D1. Drizzle 1.0.0-rc.5 has `exists`, `notExists`, `$count`, `count`, `countDistinct`, `max`, `min` that keep these typed. The rest are genuinely needed (listed below under "Keep"), so this plan does not touch them.

## Verdict table (every raw SQL site, at 0a61bc5)

| Site                                                                                                                             | What it does                                                                                                      | Verdict                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/transfers.ts:189` `${now} + ${retentionDays} * ${DAY_MS}` in `.set()`                                              | column arithmetic in SET                                                                                          | KEEP (drizzle has no arithmetic operators)                                                                                                                                                                                                          |
| `transfers.ts:196` `EXISTS (SELECT 1 FROM transfer WHERE transfer.delivery_id = ...)`                                            | correlated exists                                                                                                 | REPLACE with `exists(db.select({ one: sql\`1\` }).from(schema.transfer).where(eq(schema.transfer.deliveryId, schema.delivery.id)))`                                                                                                                 |
| `transfers.ts:197` `NOT EXISTS (... state != 'complete')`                                                                        | correlated not exists                                                                                             | REPLACE with `notExists(...ne(schema.transfer.state, "complete"))`                                                                                                                                                                                  |
| `deliveries.ts:74-77` `createdSince` `(select count(*) ...)`                                                                     | count subquery in WHERE                                                                                           | REPLACE with `db.$count(schema.delivery, and(...))` (a `SQLiteEffectCountBuilder`, which is both a `SQL` fragment and an Effect; verify it renders as a subquery inside `lt(...)`)                                                                  |
| `deliveries.ts:215-217` `count(...)`, `max(...)`, `min(...)` as `sql<number>`                                                    | aggregates                                                                                                        | REPLACE with `count(col)`, `max(col)`, `min(col)` from `drizzle-orm`; `max`/`min` of a timestamp column decode to `Date`, so `new Date(row.lastAt)` at :227-228 goes away                                                                           |
| `deliveries.ts:301` `coalesce(sum(size), 0)` and `file-requests.ts:150`                                                          | sum with default                                                                                                  | KEEP as is (drizzle `sum()` returns string or null; coalesce stays SQL), but type `sql<number>` is honest here                                                                                                                                      |
| `file-requests.ts:152` `count(distinct ...)`                                                                                     | distinct count                                                                                                    | REPLACE with `countDistinct(schema.delivery.id)`                                                                                                                                                                                                    |
| `deliveries.ts:373` `(subquery) + n <= limit`                                                                                    | arithmetic compare of subquery                                                                                    | KEEP                                                                                                                                                                                                                                                |
| `deliveries.ts:415-423` `exists (select 1 from file_request where ...)`                                                          | correlated exists, mixes builders                                                                                 | REPLACE outer string with `exists(db.select({ one: sql\`1\` }).from(schema.fileRequest).where(and(...)))`; the inner `sql\`(${requestBytes}) + n <= maxBytes\`` stays                                                                               |
| `deliveries.ts:498` `(select value from json_each(${json}))`                                                                     | one JSON parameter instead of N, because D1 caps bound parameters at 100                                          | KEEP (documented necessity)                                                                                                                                                                                                                         |
| `deliveries.ts:669` `EXISTS (SELECT 1 FROM delivery WHERE delivery.id = transfer.delivery_id AND delivery.status = 'cancelled')` | correlated exists in UPDATE                                                                                       | REPLACE with `exists(db.select({ one: sql\`1\` }).from(schema.delivery).where(and(eq(schema.delivery.id, schema.transfer.deliveryId), eq(schema.delivery.status, "cancelled"))))`                                                                   |
| `deliveries.ts:775` `EXISTS (... delivery.sender_id = ${senderId})`                                                              | owner check inside UPDATE of `link`                                                                               | REPLACE with `exists(...)` over `schema.delivery`                                                                                                                                                                                                   |
| `file-requests.ts:237` `coalesce(closedAt, now)` in `.set()`                                                                     | idempotent close                                                                                                  | KEEP                                                                                                                                                                                                                                                |
| `emails.ts:233` `mine` count with join                                                                                           | per-sender emails today                                                                                           | REPLACE with `db.$count(schema.deliveryEmail, and(gt(schema.deliveryEmail.createdAt, since), inArray(schema.deliveryEmail.deliveryId, db.select({ id: schema.delivery.id }).from(schema.delivery).where(eq(schema.delivery.senderId, senderId)))))` |
| `emails.ts:234` `everyone` count                                                                                                 | emails today                                                                                                      | REPLACE with `db.$count(schema.deliveryEmail, gt(schema.deliveryEmail.createdAt, since))`                                                                                                                                                           |
| `emails.ts:243` `json_each(...)` as row source                                                                                   | generates N rows for INSERT...SELECT                                                                              | KEEP                                                                                                                                                                                                                                                |
| `emails.ts:246-247` `mine + needed <= limit`                                                                                     | arithmetic compare                                                                                                | KEEP                                                                                                                                                                                                                                                |
| `shared-links.ts:196-197` `excluded.last_at`, `coalesce(...)` in `onConflictDoUpdate`                                            | upsert from INSERT...SELECT                                                                                       | KEEP                                                                                                                                                                                                                                                |
| `shared-links.ts:174,178` `sql<Date>\`${now.getTime()}\`` literal columns                                                        | literal projection in INSERT...SELECT                                                                             | KEEP, but the type argument lies (the value is a number). Change `sql<Date>` to `sql<number>` only if the insert column typing accepts it; else leave and add a one-line comment                                                                    |
| `plans.ts:25,28` `databaseNow`, `latest`                                                                                         | DB clock compared with request clock on purpose                                                                   | KEEP (plan 03 moves the expression to one export)                                                                                                                                                                                                   |
| `plans.ts:175` `coalesce(expiresAt <= latest, 0)` mapWith(Boolean)                                                               | expired flag                                                                                                      | KEEP                                                                                                                                                                                                                                                |
| `plans.ts:262,267` `plan: sql\`(${stillOpen})\``, `uses + 1`                                                                     | atomic redeem via NOT NULL failure                                                                                | KEEP                                                                                                                                                                                                                                                |
| `infrastructure/auth.ts:107-108` `.from(sql\`(select 1)\`)`+`(select count(*) from signup where ...)`                            | atomic conditional insert                                                                                         | KEEP the FROM; REPLACE the count with `db.$count(schema.signup, recent)`                                                                                                                                                                            |
| `index.ts:244` `db.run(sql\`SELECT 1\`)`                                                                                         | health probe                                                                                                      | KEEP                                                                                                                                                                                                                                                |
| `packages/db/src/database.ts:51` `client.unsafe(sql, params)`                                                                    | drizzle's Effect driver has no `batch`, so queries are compiled with `.toSQL()` and sent through `D1Client.batch` | KEEP (adapter)                                                                                                                                                                                                                                      |
| `apps/api/test/deliveries.test.ts:1411`                                                                                          | test seeding                                                                                                      | KEEP                                                                                                                                                                                                                                                |

## Current state (key excerpts)

`apps/api/src/transfers.ts:184-200`:

```ts
const markReady = (deliveryId?: DeliveryId) =>
  Effect.flatMap(Clock.currentTimeMillis, (now) =>
    db
      .update(schema.delivery)
      .set({
        expiresAt: sql`${now} + ${schema.delivery.retentionDays} * ${DAY_MS}`,
        status: "ready",
      })
      .where(
        and(
          deliveryId === undefined ? undefined : eq(schema.delivery.id, deliveryId),
          eq(schema.delivery.status, "open"),
          sql`EXISTS (SELECT 1 FROM transfer WHERE transfer.delivery_id = ${schema.delivery.id})`,
          sql`NOT EXISTS (SELECT 1 FROM transfer WHERE transfer.delivery_id = ${schema.delivery.id} AND transfer.state != 'complete')`,
        ),
      ),
  );
```

`apps/api/src/deliveries.ts:661-671` (the `EXISTS (SELECT 1 FROM delivery ...)`), `:769-778` (`setPassword`), `:72-77` (`createdSince`), `:411-423` (`requestAccepts`). Existing code already uses builder subqueries inside templates (`activeBytesAt`, `requestBytes` in deliveries.ts), so the style is established.

## Commands you will need

| Purpose              | Command       | Expected |
| -------------------- | ------------- | -------- |
| Check                | `vp check`    | exit 0   |
| API tests (local D1) | `vp run test` | all pass |

## Scope

**In scope**: `apps/api/src/transfers.ts`, `deliveries.ts`, `file-requests.ts`, `emails.ts`, `infrastructure/auth.ts`.
**Out of scope**: `packages/db/src/schema.ts` (plan 03), `plans.ts`, every KEEP row, any new test file, migrations.

## Steps

1. **`exists`/`notExists` (transfers.ts, deliveries.ts x3).** Import `exists`, `notExists`, `ne` from `drizzle-orm`. Convert one site, then print the SQL to confirm column qualification: in a scratch script or by temporarily logging `query.toSQL().sql` for the `markReady` update (do not commit the log). Expected: `exists (select 1 from "transfer" where "transfer"."delivery_id" = "delivery"."id")` and the outer UPDATE keeps `"delivery"` unqualified-table semantics. In an UPDATE, SQLite allows the correlated reference to the updated table. **Verify**: `vp run test` passes the `finalize`, `purge`, `cancel` and password tests in `apps/api/test/deliveries.test.ts` and `transfers.test.ts`.
2. **`$count` (deliveries.ts:74, emails.ts:233-234, auth.ts:108).** Replace the string subqueries. If `db.$count(...)` does not render as a parenthesized scalar subquery when embedded in `lt(...)`/`sql` templates in the Effect driver, STOP and report the rendered SQL (see STOP).
3. **Aggregates (deliveries.ts:215-217, file-requests.ts:152).** Use `count`, `max`, `min`, `countDistinct`. Remove the now-unneeded `new Date(...)` wrappers where `max`/`min` return `Date`. If a decoded value is not a `Date` at runtime, STOP.
4. Run `vp check` and `vp run test`.

## Test plan

No new test files. The cases that matter already exist in `apps/api/test/deliveries.test.ts` (racing creates, plan limits, abandoned-delivery sweep, password set) and `transfers.test.ts` (finalize converges, markReady). If the executor believes a case is uncovered, report it and ask for approval to add one.

## Done criteria

- [ ] `vp check` exit 0, `vp run test` exit 0
- [ ] `rg -n "FROM (delivery|transfer|file_request)\b" apps/api/src` returns nothing
- [ ] `rg -n "select count\(\*\)" apps/api/src` returns nothing
- [ ] Only the five in-scope files changed

## STOP conditions

- `db.$count` or `exists` renders different SQL than described, or any existing test changes outcome.
- Any change would require touching a KEEP row.
- A table or column alias appears in the rendered SQL that D1 rejects.

## Maintenance notes

New conditional-insert statements (the repo's way to stay atomic on D1) should compose builders and use raw `sql` only for arithmetic and `json_each`. Plan 12 adds a lint rule against table names inside `sql` strings.

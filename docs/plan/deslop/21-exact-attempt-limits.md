# Plan 21: Count password and access-code attempts exactly in D1, and fail closed

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. A new D1 table needs a generated migration (`vp run --filter @tranzfer/db generate`); do not hand-write SQL. No new test files without approval. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/shared-links.ts apps/api/src/plans.ts apps/api/src/infrastructure/auth.ts apps/api/src/index.ts packages/db/src/schema.ts packages/contracts/src/billing.ts apps/api/src/sweeper.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: M (~200 lines incl. migration) | **Risk**: MED (new write on the unlock path) | **Depends on**: plan 04 (if it has landed, remove two `bindingLimits` rows; otherwise remove the two blocks in `index.ts`) | **Category**: security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

The only brute-force protection on a link password is two Cloudflare rate-limit binding counters: 10 attempts a minute per IP and 5 a minute per link (`contracts/src/billing.ts:64-65`, used at `shared-links.ts` `unlock` lines ~211-225). Cloudflare documents that binding as "permissive, eventually consistent, and intentionally designed to not be used as an accurate accounting system", with "a unique limit per Cloudflare location" for each key (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). The repo's limiter also fails open on any binding error (`index.ts:105-113`: `Effect.catchTag("RateLimitError", ... Effect.as(true))`). So an attacker spread over locations, or during a limiter outage, gets many more than 5 tries a minute per link. The password policy is a minimum of 8 characters and nothing else (`LinkPassword`, `contracts/src/link.ts:38`), and PBKDF2 runs at 100,000 iterations, below the OWASP figure for PBKDF2-SHA256 (the code comment at `passwords.ts` says why: Workers cap at 100,000). The same weakness covers access-code guessing (`codeRedemptions`, 5 a minute per user, `plans.ts:225`), where a guessed code gives a paid plan.
The repo already has the exact version of this limiter: `admitSignup` (`infrastructure/auth.ts:93-130`) inserts a row only while a `count(*)` over the window is under the limit, in one statement, so concurrent attempts cannot pass it.

## Current state

`shared-links.ts` `unlock` (`attempts.allowIp(ip)` then `attempts.allowLink(linkId)`, each returning `RateLimited` with `retryAfterSeconds: windowSeconds`) runs before the database read and PBKDF2. `plans.ts` `redeem` starts with `if (!(yield* allowRedeem(userId)))`. `admitSignup` (auth.ts), the model:

```ts
const [admitted] =
  yield *
  db
    .insert(schema.signup)
    .select((qb) =>
      qb
        .select({ createdAt: sql<Date>`${now}`.as("created_at"), ip: sql<string>`${ip}`.as("ip") })
        .from(sql`(select 1)`)
        .where(lt(sql`(select count(*) from ${schema.signup} where ${recent})`, newAccounts.limit)),
    )
    .returning();
```

(The count is now `db.$count(schema.signup, recent)`.)

## Target design

One table and one function:

```ts
// packages/db/src/schema.ts
export const attempt = sqliteTable(
  "attempt",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["code", "unlock"] }).notNull(),
    key: text("key").notNull(), // link id, or user id
    ip: text("ip"), // unlock only
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("attempt_kind_key_createdAt_idx").on(t.kind, t.key, t.createdAt),
    index("attempt_kind_ip_createdAt_idx").on(t.kind, t.ip, t.createdAt),
  ],
);
```

and `Attempts.take(kind, key, ip?)`: `Effect<void, RateLimited>` in a new `apps/api/src/attempts.ts`: it runs the conditional insert-select with the limits from `rateLimits` (`passwordAttemptsPerLink`, `passwordAttemptsPerIp`, `codeRedemptions`), and on zero rows fails with `RateLimited({ limit, retryAfterSeconds })` computed with `secondsUntilRoom` over the newest rows (as `admitSignup` does). Which limit refused is decided by a second count query, as `admitSignup` and `Emails.refusal` do. Database errors die (fail closed), per `dieOnDatabaseError`. The Cloudflare binding for these three names is deleted.

## Commands you will need

| Purpose   | Command                                 | Expected                                      |
| --------- | --------------------------------------- | --------------------------------------------- |
| Check     | `vp check`                              | exit 0                                        |
| Tests     | `vp run test`                           | pass                                          |
| Migration | `vp run --filter @tranzfer/db generate` | one new folder under `packages/db/migrations` |

## Scope

**In scope**: `packages/db/src/schema.ts`, the generated migration, new `apps/api/src/attempts.ts`, `shared-links.ts`, `plans.ts`, `index.ts` (remove the 3 bindings or `bindingLimits` rows), `sweeper.ts` (prune), `apps/api/test/support.ts` (provide `Attempts`; edit only).
**Out of scope**: the `signup` table (a later plan can fold it into `attempt`), `rateLimits` numbers, PBKDF2 cost, password policy.

## Steps

1. Add the table; generate the migration; check the SQL file only creates `attempt` and its two indexes. **Verify**: `vp run --filter @tranzfer/db generate` twice; the second run reports no changes.
2. Write `attempts.ts` with `Attempts.layer` (`Context.Service` over `Database`, `Clock`) and `take`. For `unlock`, one statement inserts a row with `kind='unlock', key=linkId, ip` only while BOTH `count(kind='unlock', key=linkId, window)` < `passwordAttemptsPerLink.limit` AND `count(kind='unlock', ip, window)` < `passwordAttemptsPerIp.limit`. For `code`: `count(kind='code', key=userId, window)` < `codeRedemptions.limit`.
3. `SharedLinks.unlock`: replace the two `attempts.allow*` checks with `yield* attempts.take("unlock", linkId, ip)` (after the token verify, before the link read, as today). `Plans.redeem`: `yield* attempts.take("code", userId)`. Delete the `allowIp`/`allowLink`/`allowRedeem` parameters (or plan 04's `RateLimiter.check` calls for those names).
4. Sweeper: add one step `Attempts.prune` deleting rows older than 24 hours (the longest window used is 60 s; keep a day for debugging), wrapped like the other steps (plan 01's `isolated`).
5. Remove the three Cloudflare rate-limit resources from `index.ts` (`PASSWORD_ATTEMPTS_IP` 1006, `PASSWORD_ATTEMPTS_LINK` 1007, `CODE_REDEMPTIONS` 1003). **Verify** with `vp run plan` on a dev stage: the plan deletes exactly those three rate-limit resources and nothing else.
6. `vp check`, `vp run test` (the password and code tests in `apps/api/test/shared-links.test.ts` and `deliveries.test.ts` must pass: they assert that the Nth attempt is refused and the first N are accepted).

## Test plan

No new test files. Existing coverage: `shared-links.test.ts` (wrong password counts, lockout) and the access-code tests in `deliveries.test.ts`. If they relied on the in-memory `counting(limit)` limiter in `support.ts`, the new `Attempts` runs on the real local D1 in tests, which is what we want; check they still pass without changing assertions.

## Done criteria

- [ ] `vp check`, `vp run test` exit 0
- [ ] `rg -n "passwordAttempts|codeRedemptions" apps/api/src/index.ts` returns nothing
- [ ] The migration creates only `attempt`
- [ ] With D1 made to fail, `UnlockLink` returns a defect, never an unlocked link

## STOP conditions

- Product question not answered: counting every attempt per link (right or wrong, as today) lets anyone holding the link keep the real recipient locked out at 5 tries a minute. Today's binding has the same effect. Ask the founder whether to keep it (simple, recommended for now) or add a lockout recovery (the sender resets the link by changing its password).
- `vp run plan` shows more than the three rate-limit resources changing.

## Maintenance notes

This table is the home for the next exact counter. The signup cap (`signup` table), delivery caps and email caps are three more copies of the same statement; a single `Attempts`-style helper for "insert while the window count is under the limit" would remove them, but that is a refactor of working code and is not part of this plan.

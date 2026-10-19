import { RateLimited, rateLimits } from "@tranzfer/contracts";
import type { RateLimitName } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Seconds until a rolling window has room again, given the creation times in
 * it newest first, or undefined while it has room. The window is full when
 * its limit-th newest entry is still inside it.
 */
export const secondsUntilRoom = (
  newestFirst: readonly Date[],
  rule: { readonly limit: number; readonly windowSeconds: number },
  now: number,
) => {
  const oldestCounted = newestFirst[rule.limit - 1];
  const reopensAt =
    oldestCounted === undefined ? now : oldestCounted.getTime() + rule.windowSeconds * 1000;
  return reopensAt > now ? Math.ceil((reopensAt - now) / 1000) : undefined;
};

/**
 * Link password and access code attempts, counted exactly in D1. A database
 * error dies, so an attempt is never let through uncounted.
 */
export class Attempts extends Context.Service<
  Attempts,
  {
    /**
     * Counts one attempt, or refuses it with the limit that is full. An unlock
     * counts per link and per client IP, a code per user.
     */
    readonly take: (
      attempt:
        | { readonly kind: "code"; readonly key: string }
        | { readonly kind: "unlock"; readonly key: string; readonly ip: string },
    ) => Effect.Effect<void, RateLimited>;
    /** Deletes rows no window counts any more, so a client IP lives minutes at most. Returns how many went. */
    readonly prune: Effect.Effect<number>;
  }
>()("tranzfer/Attempts") {
  static readonly layer = Layer.effect(
    Attempts,
    Effect.gen(function* makeAttempts() {
      const { db } = yield* Database;

      return Attempts.of({
        prune: Effect.gen(function* prune() {
          const now = yield* Clock.currentTimeMillis;
          const { codeRedemptions, passwordAttemptsPerIp, passwordAttemptsPerLink } = rateLimits;
          const longestWindowSeconds = Math.max(
            codeRedemptions.windowSeconds,
            passwordAttemptsPerIp.windowSeconds,
            passwordAttemptsPerLink.windowSeconds,
          );
          const pruned = yield* db
            .delete(schema.attempt)
            .where(lt(schema.attempt.createdAt, new Date(now - longestWindowSeconds * 1000)))
            .returning({ id: schema.attempt.id });
          return pruned.length;
        }).pipe(dieOnDatabaseError, Effect.withSpan("Attempts.prune")),

        take: Effect.fn("Attempts.take")(function* take(attempt) {
          const now = yield* Clock.currentTimeMillis;
          const window = (limit: RateLimitName, where: SQL) => ({
            limit,
            recent: and(
              eq(schema.attempt.kind, attempt.kind),
              where,
              gt(schema.attempt.createdAt, new Date(now - rateLimits[limit].windowSeconds * 1000)),
            ),
            rule: rateLimits[limit],
          });
          const own = window(
            attempt.kind === "unlock" ? "passwordAttemptsPerLink" : "codeRedemptions",
            eq(schema.attempt.key, attempt.key),
          );
          const windows =
            attempt.kind === "unlock"
              ? [own, window("passwordAttemptsPerIp", eq(schema.attempt.ip, attempt.ip))]
              : [own];
          // One statement counts every window and adds the row, so concurrent
          // attempts can't pass a limit.
          const [taken] = yield* db
            .insert(schema.attempt)
            .select((qb) =>
              qb
                .select({
                  createdAt: sql<Date>`${now}`.as("created_at"),
                  ip: sql<string | null>`${attempt.kind === "unlock" ? attempt.ip : null}`.as("ip"),
                  key: sql<string>`${attempt.key}`.as("key"),
                  kind: sql<typeof attempt.kind>`${attempt.kind}`.as("kind"),
                })
                .from(sql`(select 1)`)
                .where(
                  and(
                    ...windows.map(({ recent, rule }) =>
                      lt(db.$count(schema.attempt, recent), rule.limit),
                    ),
                  ),
                ),
            )
            .returning({ id: schema.attempt.id });
          if (taken !== undefined) {
            return;
          }
          const waits = yield* Effect.forEach(windows, ({ limit, recent, rule }) =>
            db
              .select({ createdAt: schema.attempt.createdAt })
              .from(schema.attempt)
              .where(recent)
              .orderBy(desc(schema.attempt.createdAt))
              .limit(rule.limit)
              .pipe(
                Effect.map((rows) => ({
                  limit,
                  retryAfterSeconds: secondsUntilRoom(
                    rows.map((row) => row.createdAt),
                    rule,
                    now,
                  ),
                })),
              ),
          );
          const [longest] = waits
            .flatMap(({ limit, retryAfterSeconds }) =>
              retryAfterSeconds === undefined ? [] : [{ limit, retryAfterSeconds }],
            )
            .toSorted((a, b) => b.retryAfterSeconds - a.retryAfterSeconds);
          // The insert just found a window full, so a wait is almost always there.
          return yield* new RateLimited(
            longest ?? { limit: own.limit, retryAfterSeconds: own.rule.windowSeconds },
          );
        }, dieOnDatabaseError),
      });
    }),
  );
}

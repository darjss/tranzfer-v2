import { plans } from "@tranzfer/contracts";
import type { PaidPlanId, RateLimited, UserId } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { message, space } from "./emails";
import { Mail } from "./infrastructure/email";
import { RateLimiter } from "./rate-limiter";

// Opening emails per sweep. At one sweep a minute a list of a few hundred
// goes out within the hour and stays inside the account's daily sending quota.
const OPENINGS_PER_SWEEP = 20;

const onTheList = (plan: PaidPlanId, appUrl: string) =>
  message(`You're on the list for ${plans[plan].name}`, [
    "Hi,",
    `${plans[plan].name} isn't open yet. We'll email you once, the day it opens, and that's the only email you'll get about it.`,
    `Until then, Free has every feature with less space and shorter links. You can start at ${appUrl}/sign-in`,
    "If you didn't ask for this, reply and we'll take you off the list.",
    "Tranzfer",
  ]);

const planOpen = (plan: PaidPlanId, appUrl: string) =>
  message(`${plans[plan].name} is open`, [
    "Hi,",
    `You asked us to tell you when ${plans[plan].name} opened. It's open today.`,
    `${plans[plan].name} is $${plans[plan].monthlyUsd} a month for ${space(plans[plan].activeBytes)} of transfer space and links that last up to ${plans[plan].maxRetentionDays} days. Every plan has the whole product, so the money buys room and time and nothing else.`,
    `You can pick it at ${appUrl}/pricing`,
    "That was the one email we promised, so you won't hear from us about this again.",
    "Tranzfer",
  ]);

const waitingFor = (plan: PaidPlanId) =>
  and(eq(schema.planInterest.plan, plan), isNull(schema.planInterest.notifiedAt));

/**
 * Queues the "plan is open" email for everyone on a plan's list who hasn't
 * had it; the sweep sends the queue (`Interest.sendOpenings`). Rows already
 * queued keep their place. With `dryRun` it only counts. Run by
 * `interest:notify` against a stage's database.
 */
export const queueOpenings = Effect.fn("Interest.queueOpenings")(function* queueOpenings(
  plan: PaidPlanId,
  options: { readonly dryRun: boolean },
) {
  const { db } = yield* Database;
  const [row] = yield* db
    .select({ people: count() })
    .from(schema.planInterest)
    .where(waitingFor(plan));
  const waiting = row?.people ?? 0;
  if (options.dryRun) {
    return { queued: 0, waiting };
  }
  const queued = yield* db
    .update(schema.planInterest)
    .set({ notifyQueuedAt: new Date(yield* Clock.currentTimeMillis) })
    .where(and(waitingFor(plan), isNull(schema.planInterest.notifyQueuedAt)))
    .returning({ id: schema.planInterest.id });
  return { queued: queued.length, waiting };
}, dieOnDatabaseError);

/** The waitlist for paid plans and its two emails. */
export class Interest extends Context.Service<
  Interest,
  {
    /**
     * Puts the address on a plan's list. A signed-in join (`userId` set) also
     * gets the confirmation; a typed address gets none. Asking again changes
     * nothing and sends nothing. A failed send is logged, not returned: the
     * sign-up stands.
     */
    readonly join: (
      input: { readonly email: string; readonly plan: PaidPlanId; readonly userId: UserId | null },
      ip: string,
    ) => Effect.Effect<{ readonly email: string }, RateLimited>;
    /**
     * Sends the "plan is open" email to rows `interest:notify` queued. A
     * failed send leaves the row unqueued and unnotified, so running the
     * command again retries it. Returns how many it claimed.
     */
    readonly sendOpenings: Effect.Effect<number>;
  }
>()("tranzfer/Interest") {
  static readonly layer = (options: { readonly appUrl: string }) =>
    Layer.effect(
      Interest,
      Effect.gen(function* makeInterest() {
        const { db } = yield* Database;
        const mail = yield* Mail;
        const limiter = yield* RateLimiter;

        return Interest.of({
          join: Effect.fn("Interest.join")(function* join(input, ip) {
            yield* limiter.check("interestSignups", ip);
            const email = input.email.toLowerCase();
            const added = yield* db
              .insert(schema.planInterest)
              .values({ email, plan: input.plan, userId: input.userId })
              .onConflictDoNothing()
              .returning({ id: schema.planInterest.id });
            yield* Effect.annotateCurrentSpan({
              "interest.new": added.length > 0,
              "interest.plan": input.plan,
            });
            // Anyone can type any address, so only a signed-in join, which uses
            // the account's own address, gets the confirmation.
            if (added.length > 0 && input.userId !== null) {
              yield* mail.send({ to: email, ...onTheList(input.plan, options.appUrl) }).pipe(
                Effect.annotateSpans("mail.kind", "interest"),
                Effect.catchTag("MailError", () => Effect.void),
              );
            }
            return { email };
          }, dieOnDatabaseError),

          sendOpenings: Effect.gen(function* sendOpenings() {
            const now = new Date(yield* Clock.currentTimeMillis);
            const claimed = yield* db
              .update(schema.planInterest)
              .set({ notifiedAt: now })
              .where(
                inArray(
                  schema.planInterest.id,
                  db
                    .select({ id: schema.planInterest.id })
                    .from(schema.planInterest)
                    .where(
                      and(
                        isNotNull(schema.planInterest.notifyQueuedAt),
                        isNull(schema.planInterest.notifiedAt),
                      ),
                    )
                    .orderBy(asc(schema.planInterest.id))
                    .limit(OPENINGS_PER_SWEEP),
                ),
              )
              .returning({
                email: schema.planInterest.email,
                id: schema.planInterest.id,
                plan: schema.planInterest.plan,
              });
            yield* Effect.annotateCurrentSpan("emails.claimed", claimed.length);
            yield* Effect.forEach(
              claimed,
              (row) =>
                mail.send({ to: row.email, ...planOpen(row.plan, options.appUrl) }).pipe(
                  Effect.annotateSpans("mail.kind", "opening"),
                  Effect.catchTag("MailError", () =>
                    db
                      .update(schema.planInterest)
                      .set({ notifiedAt: null, notifyQueuedAt: null })
                      .where(eq(schema.planInterest.id, row.id)),
                  ),
                ),
              { concurrency: 5, discard: true },
            );
            return claimed.length;
          }).pipe(dieOnDatabaseError, Effect.withSpan("Interest.sendOpenings")),
        });
      }),
    );
}

import { plans, RateLimited, rateLimits } from "@tranzfer/contracts";
import type { PaidPlanId } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Mail } from "./infrastructure/email";

// Opening emails per sweep. At one sweep a minute a list of a few hundred
// goes out within the hour and stays inside the account's daily sending quota.
const OPENINGS_PER_SWEEP = 20;

const GB = 1000 ** 3;
const space = (bytes: number) =>
  bytes >= 1000 * GB ? `${bytes / (1000 * GB)} TB` : `${bytes / GB} GB`;

const link = (url: string) => `<a href="${url}" style="color:#2f5bd3">${url}</a>`;

// The text is the email; the HTML is the same paragraphs with live links.
// Paragraphs hold only our own copy and URLs, so nothing needs escaping.
const message = (subject: string, paragraphs: readonly string[]) => ({
  html: `<div style="font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17181c;max-width:520px">${paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px">${paragraph.replaceAll(/https:\/\/\S*[^\s.,]/gu, link)}</p>`,
    )
    .join("")}</div>`,
  subject,
  text: paragraphs.join("\n\n"),
});

const welcome = (appUrl: string) =>
  message("Your Tranzfer account is ready", [
    "Hi,",
    `Thanks for signing up. Free gives you ${space(plans.free.activeBytes)} of transfer space and links that last up to ${plans.free.maxRetentionDays} days. A delivery stops counting against that space once its link expires or you cancel it.`,
    `To send your first file, open ${appUrl}/deliveries and drop in a file or a whole folder. When it finishes you get one link, and whoever opens it can download without an account.`,
    "If your Wi-Fi drops or your laptop sleeps halfway through, open the page again. The upload picks up where it stopped instead of starting over.",
    "Something broken or confusing? Reply to this email. A person reads every one.",
    "Tranzfer",
  ]);

/**
 * The welcome for a new account. Better Auth runs it in the background after
 * the account is created, so sign-up never waits on it, and a failed send is
 * logged by Mail and dropped: this never fails.
 */
export const sendWelcome = Effect.fn("Emails.welcome")(function* sendWelcome(
  email: string,
  appUrl: string,
) {
  const mail = yield* Mail;
  yield* mail
    .send({ to: email, ...welcome(appUrl) })
    .pipe(Effect.catchTag("MailError", () => Effect.void));
});

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

/** The interest list and the emails Tranzfer sends on its own. */
export class Emails extends Context.Service<
  Emails,
  {
    /**
     * Puts the address on a plan's list and sends the confirmation. Asking
     * again changes nothing and sends nothing. A failed send is logged, not
     * returned: the sign-up stands.
     */
    readonly joinInterest: (
      input: { readonly email: string; readonly plan: PaidPlanId; readonly userId: string | null },
      ip: string,
    ) => Effect.Effect<{ readonly email: string }, RateLimited>;
    /**
     * Sends the "plan is open" email to rows `interest:notify` queued. A
     * failed send leaves the row unqueued and unnotified, so running the
     * command again retries it. Returns how many it claimed.
     */
    readonly sendOpenings: Effect.Effect<number>;
  }
>()("tranzfer/Emails") {
  /** `allowInterest` counts one interest sign-up for an IP, true while under `interestSignups`. */
  static readonly layer = (options: {
    readonly appUrl: string;
    readonly allowInterest: (ip: string) => Effect.Effect<boolean>;
  }) =>
    Layer.effect(
      Emails,
      Effect.gen(function* makeEmails() {
        const { db } = yield* Database;
        const mail = yield* Mail;

        return Emails.of({
          joinInterest: Effect.fn("Emails.joinInterest")(function* joinInterest(input, ip) {
            if (!(yield* options.allowInterest(ip))) {
              return yield* new RateLimited({
                limit: "interestSignups",
                retryAfterSeconds: rateLimits.interestSignups.windowSeconds,
              });
            }
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
            if (added.length > 0) {
              yield* mail
                .send({ to: email, ...onTheList(input.plan, options.appUrl) })
                .pipe(Effect.catchTag("MailError", () => Effect.void));
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
            yield* Effect.forEach(
              claimed,
              (row) =>
                mail
                  .send({ to: row.email, ...planOpen(row.plan, options.appUrl) })
                  .pipe(
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
          }).pipe(dieOnDatabaseError, Effect.withSpan("Emails.sendOpenings")),
        });
      }),
    );
}

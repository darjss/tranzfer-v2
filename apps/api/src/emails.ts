import { DeliveryNotShareable, plans, RateLimited, rateLimits } from "@tranzfer/contracts";
import type {
  Delivery,
  DeliveryEmail,
  DeliveryId,
  DeliveryNotFound,
  PaidPlanId,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Deliveries, secondsUntilRoom } from "./deliveries";
import { Mail } from "./infrastructure/email";

// Opening emails per sweep. At one sweep a minute a list of a few hundred
// goes out within the hour and stays inside the account's daily sending quota.
const OPENINGS_PER_SWEEP = 20;

// A delivery email still queued after this long lost its send to a dead
// isolate; the sweep marks it failed.
const LOST_AFTER_MS = 10 * 60 * 1000;

const GB = 1000 ** 3;
const space = (bytes: number) =>
  bytes >= 1000 * GB ? `${bytes / (1000 * GB)} TB` : `${bytes / GB} GB`;

const link = (url: string) => `<a href="${url}" style="color:#2f5bd3">${url}</a>`;

const page = (paragraphs: readonly string[]) =>
  `<div style="font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17181c;max-width:520px">${paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${paragraph}</p>`)
    .join("")}</div>`;

// The text is the email; the HTML is the same paragraphs with live links.
// Paragraphs hold only our own copy and URLs, so nothing needs escaping.
const message = (subject: string, paragraphs: readonly string[]) => ({
  html: page(paragraphs.map((paragraph) => paragraph.replaceAll(/https:\/\/\S*[^\s.,]/gu, link))),
  subject,
  text: paragraphs.join("\n\n"),
});

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const UNITS = ["B", "KB", "MB", "GB", "TB"];
const sizeOf = (total: number) => {
  const unit = Math.min(Math.floor(Math.log10(Math.max(total, 1)) / 3), UNITS.length - 1);
  const value = total / 1000 ** unit;
  return `${Number.isInteger(value) || value >= 100 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
};

const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

// The sender's name, title and note are theirs. The text keeps them as typed,
// the HTML escapes them, and the download link is the only link.
const deliveryMessage = (
  sender: { readonly email: string; readonly name: string },
  delivery: Delivery,
  url: string,
) => {
  const name = sender.name.replaceAll(/\s+/gu, " ").trim() || sender.email;
  const title = delivery.title.replaceAll(/\s+/gu, " ");
  const fileCount = delivery.transfers.length;
  const total = delivery.transfers.reduce((sum, transfer) => sum + transfer.size, 0);
  const facts = `${fileCount} ${fileCount === 1 ? "file" : "files"}, ${sizeOf(total)}.${
    delivery.expiresAt === null
      ? ""
      : ` The link works until ${expiryFormat.format(delivery.expiresAt)} UTC.`
  }`;
  const note = delivery.note === "" ? [] : [`${name} wrote:\n${delivery.note}`];
  const before = ["Hi,", `${name} sent you ${title} on Tranzfer.`, ...note, facts];
  const after = [`You don't need an account. Reply to this email to write to ${name}.`, "Tranzfer"];
  const html = (paragraph: string) => escapeHtml(paragraph).replaceAll("\n", "<br>");
  return {
    html: page([...before.map(html), `Download: ${link(escapeHtml(url))}`, ...after.map(html)]),
    subject: `${name} sent you ${title}`,
    text: [...before, `Download: ${url}`, ...after].join("\n\n"),
  };
};

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

const waitingFor = (plan: PaidPlanId) =>
  and(eq(schema.planInterest.plan, plan), isNull(schema.planInterest.notifiedAt));

/**
 * Queues the "plan is open" email for everyone on a plan's list who hasn't
 * had it; the sweep sends the queue (`Emails.sendOpenings`). Rows already
 * queued keep their place. With `dryRun` it only counts. Run by
 * `interest:notify` against a stage's database.
 */
export const queueOpenings = Effect.fn("Emails.queueOpenings")(function* queueOpenings(
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
    /**
     * Emails the link of the sender's ready delivery to each distinct
     * address, one email each, with replies to the sender. Returns a queued
     * row per address in request order; the mail goes out in the background
     * and each row settles to `sent` or `failed`. Nothing keeps the address.
     */
    readonly sendDelivery: (
      sender: { readonly email: string; readonly id: string; readonly name: string },
      input: { readonly deliveryId: DeliveryId; readonly recipients: readonly string[] },
    ) => Effect.Effect<
      readonly DeliveryEmail[],
      DeliveryNotFound | DeliveryNotShareable | RateLimited
    >;
    /** The sender's latest 50 emails for a delivery, newest first. */
    readonly deliveryEmails: (
      senderId: string,
      deliveryId: DeliveryId,
    ) => Effect.Effect<readonly DeliveryEmail[]>;
    /** Marks delivery emails stuck queued as failed. Returns how many. */
    readonly failLost: Effect.Effect<number>;
  }
>()("tranzfer/Emails") {
  /**
   * `allowInterest` counts one interest sign-up for an IP, true while under
   * `interestSignups`. `allowDeliveryEmail` counts one send request for a user,
   * true while under `emailRequests`. `background` runs an effect after the
   * response, like the request's waitUntil.
   */
  static readonly layer = (options: {
    readonly appUrl: string;
    readonly allowDeliveryEmail: (userId: string) => Effect.Effect<boolean>;
    readonly allowInterest: (ip: string) => Effect.Effect<boolean>;
    readonly background: (effect: Effect.Effect<void>) => Effect.Effect<void>;
  }) =>
    Layer.effect(
      Emails,
      Effect.gen(function* makeEmails() {
        const { db } = yield* Database;
        const mail = yield* Mail;
        const deliveries = yield* Deliveries;

        // Rows for `count` new emails, or none when either daily cap lacks
        // room for all of them. The statement that counts is the one that
        // inserts, so racing sends can't pass a cap.
        const reserve = (senderId: string, deliveryId: DeliveryId, needed: number, now: number) => {
          const since = new Date(now - rateLimits.emailsPerDay.windowSeconds * 1000);
          const mine = sql`(select count(*) from ${schema.deliveryEmail} inner join ${schema.delivery} on ${schema.delivery.id} = ${schema.deliveryEmail.deliveryId} where ${and(eq(schema.delivery.senderId, senderId), gt(schema.deliveryEmail.createdAt, since))})`;
          const everyone = sql`(select count(*) from ${schema.deliveryEmail} where ${gt(schema.deliveryEmail.createdAt, since)})`;
          return db
            .insert(schema.deliveryEmail)
            .select((qb) =>
              qb
                .select({
                  createdAt: sql<Date>`${now}`.as("created_at"),
                  deliveryId: sql<DeliveryId>`${deliveryId}`.as("delivery_id"),
                })
                .from(sql`json_each(${JSON.stringify(Arr.range(1, needed))})`)
                .where(
                  and(
                    sql`${mine} + ${needed} <= ${rateLimits.emailsPerDay.limit}`,
                    sql`${everyone} + ${needed} <= ${rateLimits.emailsAccountPerDay.limit}`,
                  ),
                ),
            )
            .returning({
              errorCode: schema.deliveryEmail.errorCode,
              id: schema.deliveryEmail.id,
              status: schema.deliveryEmail.status,
            });
        };

        // How long until the cap that refused has room for `needed` more.
        const refusal = Effect.fn("Emails.refusal")(function* refusal(
          senderId: string,
          needed: number,
          now: number,
        ) {
          const { emailsAccountPerDay, emailsPerDay } = rateLimits;
          const since = new Date(now - emailsPerDay.windowSeconds * 1000);
          const recent = (rule: { readonly limit: number }, own: boolean) =>
            db
              .select({ createdAt: schema.deliveryEmail.createdAt })
              .from(schema.deliveryEmail)
              .innerJoin(schema.delivery, eq(schema.delivery.id, schema.deliveryEmail.deliveryId))
              .where(
                and(
                  gt(schema.deliveryEmail.createdAt, since),
                  own ? eq(schema.delivery.senderId, senderId) : undefined,
                ),
              )
              .orderBy(desc(schema.deliveryEmail.createdAt))
              .limit(rule.limit)
              .pipe(Effect.map((rows) => rows.map((row) => row.createdAt)));
          const waits = [
            {
              limit: "emailsPerDay" as const,
              retryAfterSeconds: secondsUntilRoom(
                yield* recent(emailsPerDay, true),
                { ...emailsPerDay, limit: emailsPerDay.limit - needed + 1 },
                now,
              ),
            },
            {
              limit: "emailsAccountPerDay" as const,
              retryAfterSeconds: secondsUntilRoom(
                yield* recent(emailsAccountPerDay, false),
                { ...emailsAccountPerDay, limit: emailsAccountPerDay.limit - needed + 1 },
                now,
              ),
            },
          ].flatMap(({ limit, retryAfterSeconds }) =>
            retryAfterSeconds === undefined ? [] : [{ limit, retryAfterSeconds }],
          );
          // A send that raced in after the refusal leaves nothing to name.
          const [longest] = waits.toSorted((a, b) => b.retryAfterSeconds - a.retryAfterSeconds);
          return yield* new RateLimited(
            longest ?? { limit: "emailsPerDay", retryAfterSeconds: 60 },
          );
        }, dieOnDatabaseError);

        const settle = (
          id: number,
          status: "failed" | "sent",
          errorCode: string | null,
          now: number,
        ) =>
          db
            .update(schema.deliveryEmail)
            .set({ errorCode, sentAt: status === "sent" ? new Date(now) : null, status })
            .where(eq(schema.deliveryEmail.id, id));

        return Emails.of({
          deliveryEmails: Effect.fn("Emails.deliveryEmails")(function* deliveryEmails(
            senderId: string,
            deliveryId: DeliveryId,
          ) {
            return yield* db
              .select({
                errorCode: schema.deliveryEmail.errorCode,
                id: schema.deliveryEmail.id,
                status: schema.deliveryEmail.status,
              })
              .from(schema.deliveryEmail)
              .innerJoin(schema.delivery, eq(schema.delivery.id, schema.deliveryEmail.deliveryId))
              .where(
                and(
                  eq(schema.deliveryEmail.deliveryId, deliveryId),
                  eq(schema.delivery.senderId, senderId),
                ),
              )
              .orderBy(desc(schema.deliveryEmail.id))
              .limit(50);
          }, dieOnDatabaseError),

          failLost: Effect.gen(function* failLost() {
            const now = yield* Clock.currentTimeMillis;
            const lost = yield* db
              .update(schema.deliveryEmail)
              .set({ errorCode: "lost", status: "failed" })
              .where(
                and(
                  eq(schema.deliveryEmail.status, "queued"),
                  lt(schema.deliveryEmail.createdAt, new Date(now - LOST_AFTER_MS)),
                ),
              )
              .returning({ id: schema.deliveryEmail.id });
            return lost.length;
          }).pipe(dieOnDatabaseError, Effect.withSpan("Emails.failLost")),

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

          sendDelivery: Effect.fn("Emails.sendDelivery")(function* sendDelivery(sender, input) {
            if (!(yield* options.allowDeliveryEmail(sender.id))) {
              return yield* new RateLimited({
                limit: "emailRequests",
                retryAfterSeconds: rateLimits.emailRequests.windowSeconds,
              });
            }
            const delivery = yield* deliveries.owned(sender.id, input.deliveryId);
            if (delivery.status !== "ready") {
              return yield* new DeliveryNotShareable();
            }
            const addresses = [...new Set(input.recipients.map((to) => to.trim().toLowerCase()))];
            yield* Effect.annotateCurrentSpan({
              "delivery.id": input.deliveryId,
              "email.recipients": addresses.length,
            });
            const now = yield* Clock.currentTimeMillis;
            const reserved = yield* reserve(sender.id, input.deliveryId, addresses.length, now);
            if (reserved.length === 0) {
              return yield* refusal(sender.id, addresses.length, now);
            }
            const rows = reserved.toSorted((a, b) => a.id - b.id);
            const content = deliveryMessage(sender, delivery, `${options.appUrl}${delivery.link}`);
            yield* options.background(
              Effect.forEach(
                Arr.zip(rows, addresses),
                ([row, to]) =>
                  mail.send({ ...content, replyTo: sender.email, to }).pipe(
                    Effect.map((result) =>
                      result === "sent"
                        ? ({ code: null, status: "sent" } as const)
                        : ({ code: "held", status: "failed" } as const),
                    ),
                    Effect.catchTag("MailError", ({ code }) =>
                      Effect.succeed({ code, status: "failed" } as const),
                    ),
                    Effect.flatMap(({ code, status }) =>
                      Effect.flatMap(Clock.currentTimeMillis, (settled) =>
                        settle(row.id, status, code, settled),
                      ),
                    ),
                  ),
                { concurrency: 5, discard: true },
              ).pipe(
                dieOnDatabaseError,
                Effect.catchCause(() => Effect.logError("delivery emails not settled")),
              ),
            );
            return rows;
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

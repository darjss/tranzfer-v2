import {
  DeliveryNotShareable,
  emailHeld,
  emailLost,
  plans,
  RateLimited,
  rateLimits,
} from "@tranzfer/contracts";
import type {
  Delivery,
  DeliveryEmail,
  DeliveryId,
  DeliveryNotFound,
  Principal,
  UserId,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { secondsUntilRoom } from "./attempts";
import { Deliveries } from "./deliveries";
import { Mail } from "./infrastructure/email";
import { RateLimiter } from "./rate-limiter";

// A delivery email still queued after this long lost its send to a dead
// isolate; the sweep marks it failed.
const LOST_AFTER_MS = 10 * 60 * 1000;

const GB = 1000 ** 3;
export const space = (bytes: number) =>
  bytes >= 1000 * GB ? `${bytes / (1000 * GB)} TB` : `${bytes / GB} GB`;

const link = (url: string) => `<a href="${url}" style="color:#2f5bd3">${url}</a>`;

const page = (paragraphs: readonly string[]) =>
  `<div style="font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#17181c;max-width:520px">${paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${paragraph}</p>`)
    .join("")}</div>`;

// The text is the email; the HTML is the same paragraphs with live links.
// Paragraphs hold only our own copy and URLs, so nothing needs escaping.
export const message = (subject: string, paragraphs: readonly string[]) => ({
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

// Cuts by code point, so an emoji is never split.
const clip = (text: string, max: number) => Array.from(text).slice(0, max).join("");

// The sender's name, title and note are theirs. The text keeps them as typed,
// the HTML escapes them, and the download link is the only link. The name is
// cut to 60 characters in the subject and body, the title to 100 in the subject.
const deliveryMessage = (
  sender: { readonly email: string; readonly name: string },
  delivery: Delivery,
  url: string,
) => {
  const name = clip(sender.name.replaceAll(/\s+/gu, " ").trim(), 60) || sender.email;
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
    subject: `${name} sent you ${clip(title, 100)}`,
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
  yield* mail.send({ to: email, ...welcome(appUrl) }).pipe(
    Effect.annotateSpans("mail.kind", "welcome"),
    Effect.catchTag("MailError", () => Effect.void),
  );
});

/** The emails Tranzfer sends about deliveries. */
export class Emails extends Context.Service<
  Emails,
  {
    /**
     * Emails the link of the sender's ready delivery to each distinct
     * address, one email each, with replies to the sender. Returns a queued
     * row per address in request order; the mail goes out in the background
     * and each row settles to `sent` or `failed`. Nothing keeps the address.
     */
    readonly sendDelivery: (
      sender: Principal,
      input: { readonly deliveryId: DeliveryId; readonly recipients: readonly string[] },
    ) => Effect.Effect<
      readonly DeliveryEmail[],
      DeliveryNotFound | DeliveryNotShareable | RateLimited
    >;
    /** The sender's latest 50 emails for a delivery, newest first. */
    readonly deliveryEmails: (
      senderId: UserId,
      deliveryId: DeliveryId,
    ) => Effect.Effect<readonly DeliveryEmail[]>;
    /** Marks delivery emails stuck queued as failed. Returns how many. */
    readonly failLost: Effect.Effect<number>;
  }
>()("tranzfer/Emails") {
  /** `background` runs an effect after the response, like the request's waitUntil. */
  static readonly layer = (options: {
    readonly appUrl: string;
    readonly background: (effect: Effect.Effect<void>) => Effect.Effect<void>;
  }) =>
    Layer.effect(
      Emails,
      Effect.gen(function* makeEmails() {
        const { db } = yield* Database;
        const mail = yield* Mail;
        const deliveries = yield* Deliveries;
        const limiter = yield* RateLimiter;

        // Rows for `count` new emails, or none when either daily cap lacks
        // room for all of them. The statement that counts is the one that
        // inserts, so racing sends can't pass a cap.
        const reserve = (senderId: UserId, deliveryId: DeliveryId, needed: number, now: number) => {
          const since = new Date(now - rateLimits.emailsPerDay.windowSeconds * 1000);
          const mine = db.$count(
            schema.deliveryEmail,
            and(
              gt(schema.deliveryEmail.createdAt, since),
              inArray(
                schema.deliveryEmail.deliveryId,
                db
                  .select({ id: schema.delivery.id })
                  .from(schema.delivery)
                  .where(eq(schema.delivery.senderId, senderId)),
              ),
            ),
          );
          const everyone = db.$count(
            schema.deliveryEmail,
            gt(schema.deliveryEmail.createdAt, since),
          );
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
          senderId: UserId,
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
            senderId: UserId,
            deliveryId: DeliveryId,
          ) {
            yield* Effect.annotateCurrentSpan("delivery.id", deliveryId);
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
              .set({ errorCode: emailLost, status: "failed" })
              .where(
                and(
                  eq(schema.deliveryEmail.status, "queued"),
                  lt(schema.deliveryEmail.createdAt, new Date(now - LOST_AFTER_MS)),
                ),
              )
              .returning({ id: schema.deliveryEmail.id });
            return lost.length;
          }).pipe(dieOnDatabaseError, Effect.withSpan("Emails.failLost")),

          sendDelivery: Effect.fn("Emails.sendDelivery")(function* sendDelivery(sender, input) {
            yield* limiter.check("emailRequests", sender.id);
            yield* Effect.annotateCurrentSpan("delivery.id", input.deliveryId);
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
                    Effect.annotateSpans({
                      "delivery.id": input.deliveryId,
                      "mail.kind": "delivery",
                    }),
                    Effect.map((result) =>
                      result === "sent"
                        ? ({ code: null, status: "sent" } as const)
                        : ({ code: emailHeld, status: "failed" } as const),
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
        });
      }),
    );
}

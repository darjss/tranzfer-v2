import { RuntimeContext } from "alchemy";
import type * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** Cloudflare refused or failed the send. `code` is theirs, like `E_RECIPIENT_SUPPRESSED`. */
export class MailError extends Data.TaggedError("MailError")<{ readonly code: string }> {}

/**
 * One email to one person, from hello@. Replies go to support@ unless the
 * message names another `replyTo`. Resolves to `sent` once Cloudflare took the
 * message, or `held` when this stage's allowlist kept it back.
 */
export class Mail extends Context.Service<
  Mail,
  {
    readonly send: (message: {
      readonly to: string;
      readonly subject: string;
      readonly text: string;
      readonly html: string;
      readonly replyTo?: string;
    }) => Effect.Effect<"sent" | "held", MailError>;
  }
>()("tranzfer/Mail") {}

/**
 * Addresses a staging or preview stage may email, comma-separated, read at
 * deploy time like every other Worker config. Unset, those stages email no one.
 */
export const emailAllowlist = Config.String("EMAIL_ALLOWLIST").pipe(
  Config.withDefault(""),
  Config.map(
    (value) =>
      new Set(
        value
          .split(",")
          .map((address) => address.trim().toLowerCase())
          .filter((address) => address !== ""),
      ),
  ),
);

// The send binding throws an Error carrying a `code`; that code is the only
// part worth keeping, since the message can repeat the address.
const ErrorCode = Schema.Struct({ code: Schema.String });

/**
 * Production emails anyone. A local stage's binding is Alchemy's email
 * simulator, which writes .eml files under .alchemy/local/email and delivers
 * nothing. Staging and previews hold real people's sign-ups, so they email
 * only `allowlist` and log the rest. Logs never carry the address.
 */
export const makeMail = (
  stage: "production" | "staging" | "dev",
  client: Cloudflare.Email.SendClient,
  allowlist: ReadonlySet<string>,
) =>
  Mail.of({
    send: Effect.fn("Mail.send")(function* send(message) {
      if (stage === "staging" && !allowlist.has(message.to.toLowerCase())) {
        yield* Effect.logInfo("email held because the recipient is not on this stage's allowlist");
        return "held" as const;
      }
      yield* client
        .send({
          ...message,
          from: { email: "hello@tranzfer.app", name: "Tranzfer" },
          replyTo: message.replyTo ?? "support@tranzfer.app",
        })
        .pipe(
          Effect.provide(RuntimeContext.phantom),
          Effect.mapError(
            (error) =>
              new MailError({
                code: Option.match(Schema.decodeUnknownOption(ErrorCode)(error.cause), {
                  onNone: () => "unknown",
                  onSome: ({ code }) => code,
                }),
              }),
          ),
          Effect.tapError((error) => Effect.logWarning("email not sent", error.code)),
        );
      return "sent" as const;
    }),
  });

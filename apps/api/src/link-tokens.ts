import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

const encoder = new TextEncoder();

/** How long a right password keeps a link open for the browser that typed it. */
const UNLOCK_TTL = Duration.hours(24);

/** A fresh, unguessable link id. */
export const newLinkId = Effect.sync(() =>
  Base64Url.encode(crypto.getRandomValues(new Uint8Array(16))),
);

const unlockMessage = (linkId: string, binding: string, expiresAt: number) =>
  `unlock\n${linkId}\n${binding}\n${expiresAt}`;

/**
 * Link tokens are `${linkId}.${hmac(linkId)}`: a sender can copy the same link
 * again later, and nothing token-shaped is stored.
 *
 * An unlock is `${expiresAtMs}.${hmac("unlock", linkId, binding, expiresAtMs)}`.
 * The MAC covers the link, so it opens no other link. `binding` is the link's
 * stored password hash, so setting, changing or clearing the password ends
 * every unlock issued before. Link tokens MAC the bare link id, which can't
 * equal a message that starts with "unlock\n".
 */
export class LinkTokens extends Context.Service<
  LinkTokens,
  {
    readonly issue: (linkId: string) => Effect.Effect<string>;
    readonly verify: (token: string) => Effect.Effect<Option.Option<string>>;
    readonly issueUnlock: (
      linkId: string,
      binding: string,
    ) => Effect.Effect<{ readonly expiresAt: Date; readonly unlock: string }>;
    readonly verifyUnlock: (
      unlock: string,
      linkId: string,
      binding: string,
    ) => Effect.Effect<boolean>;
  }
>()("tranzfer/LinkTokens") {
  /** The secret is read on first use, once per isolate. */
  static readonly layer = (secret: Effect.Effect<Redacted.Redacted>) =>
    Layer.effect(
      LinkTokens,
      Effect.gen(function* makeLinkTokens() {
        const key = yield* Effect.cached(
          Effect.flatMap(secret, (value) =>
            Effect.promise(
              async () =>
                await crypto.subtle.importKey(
                  "raw",
                  encoder.encode(Redacted.value(value)),
                  { hash: "SHA-256", name: "HMAC" },
                  false,
                  ["sign", "verify"],
                ),
            ),
          ),
        );
        const sign = (message: string) =>
          Effect.flatMap(key, (hmac) =>
            Effect.promise(
              async () => await crypto.subtle.sign("HMAC", hmac, encoder.encode(message)),
            ),
          ).pipe(Effect.map((digest) => Base64Url.encode(new Uint8Array(digest))));

        return LinkTokens.of({
          issue: Effect.fn("LinkTokens.issue")(function* issue(linkId: string) {
            return `${linkId}.${yield* sign(linkId)}`;
          }),
          issueUnlock: Effect.fn("LinkTokens.issueUnlock")(function* issueUnlock(
            linkId: string,
            binding: string,
          ) {
            const expiresAt = (yield* Clock.currentTimeMillis) + Duration.toMillis(UNLOCK_TTL);
            const mac = yield* sign(unlockMessage(linkId, binding, expiresAt));
            return { expiresAt: new Date(expiresAt), unlock: `${expiresAt}.${mac}` };
          }),
          verify: Effect.fn("LinkTokens.verify")(function* verify(token: string) {
            const [linkId, signature, ...rest] = token.split(".");
            if (!linkId || signature === undefined || rest.length > 0) {
              return Option.none();
            }
            const decoded = Base64Url.decode(signature);
            if (decoded._tag === "Failure") {
              return Option.none();
            }
            const hmac = yield* key;
            // WebCrypto's HMAC verify compares in constant time.
            const valid = yield* Effect.promise(
              async () =>
                await crypto.subtle.verify("HMAC", hmac, decoded.success, encoder.encode(linkId)),
            );
            return valid ? Option.some(linkId) : Option.none();
          }),
          verifyUnlock: Effect.fn("LinkTokens.verifyUnlock")(function* verifyUnlock(
            unlock: string,
            linkId: string,
            binding: string,
          ) {
            const [expiry, signature, ...rest] = unlock.split(".");
            const expiresAt = Number(expiry);
            const decoded = Base64Url.decode(signature ?? "");
            if (
              rest.length > 0 ||
              !Number.isSafeInteger(expiresAt) ||
              decoded._tag === "Failure" ||
              expiresAt <= (yield* Clock.currentTimeMillis)
            ) {
              return false;
            }
            const hmac = yield* key;
            return yield* Effect.promise(
              async () =>
                await crypto.subtle.verify(
                  "HMAC",
                  hmac,
                  decoded.success,
                  encoder.encode(unlockMessage(linkId, binding, expiresAt)),
                ),
            );
          }),
        });
      }),
    );
}

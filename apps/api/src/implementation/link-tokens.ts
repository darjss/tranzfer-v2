import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

const encoder = new TextEncoder();

/** A fresh, unguessable link id. */
export const newLinkId = Effect.sync(() =>
  Base64Url.encode(crypto.getRandomValues(new Uint8Array(16))),
);

/**
 * Link tokens are `${linkId}.${hmac(linkId)}`: a sender can copy the same link
 * again later, and nothing token-shaped is stored.
 */
export class LinkTokens extends Context.Service<
  LinkTokens,
  {
    readonly issue: (linkId: string) => Effect.Effect<string>;
    readonly verify: (token: string) => Effect.Effect<Option.Option<string>>;
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
        const sign = (linkId: string) =>
          Effect.flatMap(key, (hmac) =>
            Effect.promise(
              async () => await crypto.subtle.sign("HMAC", hmac, encoder.encode(linkId)),
            ),
          ).pipe(Effect.map((digest) => Base64Url.encode(new Uint8Array(digest))));

        return LinkTokens.of({
          issue: Effect.fn("LinkTokens.issue")(function* issue(linkId: string) {
            return `${linkId}.${yield* sign(linkId)}`;
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
        });
      }),
    );
}

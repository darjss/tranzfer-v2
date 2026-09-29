import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

const encoder = new TextEncoder();

// 22 base64url chars keep 132 bits of the HMAC; plenty against forgery.
const SIGNATURE_LENGTH = 22;

/** A fresh, unguessable link id. */
export const newLinkId = Effect.sync(() =>
  Encoding.encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
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
                  ["sign"],
                ),
            ),
          ),
        );
        const sign = (linkId: string) =>
          Effect.flatMap(key, (hmac) =>
            Effect.promise(
              async () => await crypto.subtle.sign("HMAC", hmac, encoder.encode(linkId)),
            ),
          ).pipe(
            Effect.map((digest) =>
              Encoding.encodeBase64Url(new Uint8Array(digest)).slice(0, SIGNATURE_LENGTH),
            ),
          );

        return LinkTokens.of({
          issue: Effect.fn("LinkTokens.issue")(function* issue(linkId: string) {
            return `${linkId}.${yield* sign(linkId)}`;
          }),
          verify: Effect.fn("LinkTokens.verify")(function* verify(token: string) {
            const [linkId, signature, ...rest] = token.split(".");
            if (!linkId || signature === undefined || rest.length > 0) {
              return Option.none();
            }
            const expected = encoder.encode(yield* sign(linkId));
            const provided = encoder.encode(signature);
            return provided.length === expected.length &&
              crypto.subtle.timingSafeEqual(provided, expected)
              ? Option.some(linkId)
              : Option.none();
          }),
        });
      }),
    );
}

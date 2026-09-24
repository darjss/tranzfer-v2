import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

const encoder = new TextEncoder();

const base64url = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

// The token is `${id}.${signature}`, so a delivery's link is recomputable:
// the sender can copy the same link again later and nothing token-shaped is
// stored.
export const newLinkId = () => base64url(crypto.getRandomValues(new Uint8Array(16)));

export class Links extends Context.Service<
  Links,
  {
    readonly issue: (linkId: string) => Effect.Effect<string>;
    readonly verify: (token: string) => Effect.Effect<Option.Option<string>>;
  }
>()("tranzfer/Links") {
  static readonly make = (secret: Effect.Effect<Redacted.Redacted>) =>
    Layer.unwrap(
      Effect.gen(function* linksLayer() {
        // Imported once per isolate; the accessor reads a Worker binding.
        const hmacKey = yield* Effect.cached(
          secret.pipe(
            Effect.flatMap((value) =>
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
          ),
        );

        const sign = (linkId: string) =>
          hmacKey.pipe(
            Effect.flatMap((key) =>
              Effect.promise(
                async () => await crypto.subtle.sign("HMAC", key, encoder.encode(linkId)),
              ),
            ),
            Effect.map((digest) => base64url(digest).slice(0, 22)),
          );

        return Layer.succeed(
          Links,
          Links.of({
            issue: (linkId) => Effect.map(sign(linkId), (sig) => `${linkId}.${sig}`),
            verify: Effect.fn("Links.verify")(function* verify(token: string) {
              const dot = token.indexOf(".");
              if (dot <= 0) {
                return Option.none<string>();
              }
              const linkId = token.slice(0, dot);
              const expected = yield* sign(linkId);
              const provided = token.slice(dot + 1);
              if (
                provided.length !== expected.length ||
                !(yield* Effect.sync(() =>
                  crypto.subtle.timingSafeEqual(encoder.encode(provided), encoder.encode(expected)),
                ))
              ) {
                return Option.none();
              }
              return Option.some(linkId);
            }),
          }),
        );
      }),
    );
}

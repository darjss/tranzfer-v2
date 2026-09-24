import { BetterAuth, Database as AuthDatabase } from "@alchemy.run/better-auth";
import type { BetterAuthProps } from "@alchemy.run/better-auth";
import { Principal } from "@tranzfer/contracts";
import { Database, schema } from "@tranzfer/db";
import { RuntimeContext } from "alchemy";
import { Stage } from "alchemy/Stage";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Cookies from "effect/unstable/http/Cookies";
import type * as HttpBody from "effect/unstable/http/HttpBody";
import type * as HttpServerError from "effect/unstable/http/HttpServerError";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { AuthError } from "./auth-error";

// Jobs and tests outside Alchemy get no Stage service; the deploy-time
// interceptor binds ALCHEMY_STAGE into the Worker for runtime reads.
const stageName = Effect.serviceOption(Stage).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Config.String("ALCHEMY_STAGE").pipe(Config.option),
      onSome: (stage) => Effect.succeed(Option.some(stage)),
    }),
  ),
);

const Origin = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
      } catch {
        return false;
      }
    },
    { message: "APP_URL must be an HTTP(S) origin without a trailing slash" },
  ),
);

const SigningSecret = Schema.Redacted(Schema.String.check(Schema.isMinLength(32)));

export class Auth extends Context.Service<
  Auth,
  {
    readonly fetch: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      HttpServerError.HttpServerError | HttpBody.HttpBodyError,
      HttpServerRequest.HttpServerRequest | Scope.Scope
    >;
    readonly session: (
      headers: Headers,
    ) => Effect.Effect<
      { cookies: Cookies.Cookies; principal: Option.Option<Principal> },
      AuthError
    >;
  }
>()("tranzfer/Auth") {
  static readonly make = Effect.gen(function* makeAuth() {
    const stage = yield* stageName;
    const origin = yield* Config.String("APP_URL").pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Origin)),
    );
    const googleClientId = yield* Config.String("GOOGLE_CLIENT_ID");
    const googleClientSecret = yield* Config.Redacted("GOOGLE_CLIENT_SECRET");
    // Production keeps the configured secret; every other stage omits it and
    // the plugin auto-provisions a stable Alchemy.Random.
    const secret =
      Option.isSome(stage) && stage.value === "production"
        ? yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(SigningSecret)),
          )
        : undefined;

    const props: BetterAuthProps = {
      advanced: { database: { validateSchema: false } },
      basePath: "/api/auth",
      baseURL: origin,
      logger: {
        // Adapter error arguments can contain session tokens in SQL parameters.
        log: (level, message) => {
          console.error("Better Auth", level, message);
        },
      },
      migrate: false,
      socialProviders: {
        google: { clientId: googleClientId, clientSecret: Redacted.value(googleClientSecret) },
      },
      trustedOrigins: [origin],
    };

    // Our columns are snake_case with integer-ms dates, which the plugin's
    // Kysely D1 layer can't handle; this custom Database layer is the drizzle
    // adapter over our lazy D1 accessor, resolved inside each invocation.
    const raw = yield* Database;
    const authDatabase = Layer.succeed(
      AuthDatabase,
      AuthDatabase.of({
        provider: "sqlite",
        runtime: raw.pipe(
          Effect.map((handle) => drizzleAdapter(drizzle(handle), { provider: "sqlite", schema })),
        ),
      }),
    );

    const instance = yield* BetterAuth(secret === undefined ? props : { ...props, secret }).pipe(
      Effect.provide(authDatabase),
    );

    return Auth.of({
      fetch: instance.fetch.pipe(Effect.provide(RuntimeContext.phantom)),
      session: Effect.fn("Auth.session")((headers: Headers) =>
        instance.auth.pipe(
          Effect.provide(RuntimeContext.phantom),
          // The escape hatch: non-API errors must stay typed AuthError
          // failures, not defects.
          Effect.flatMap((native) =>
            Effect.tryPromise({
              catch: (cause) => new AuthError({ cause, op: "session" }),
              try: async () => await native.api.getSession({ headers, returnHeaders: true }),
            }),
          ),
          Effect.map((result) => ({
            cookies: Cookies.fromSetCookie(result.headers.getSetCookie()),
            principal: Option.fromNullishOr(result.response).pipe(
              Option.map(
                (r) =>
                  new Principal({
                    email: r.user.email,
                    id: r.user.id,
                    image: r.user.image ?? null,
                    name: r.user.name,
                  }),
              ),
            ),
          })),
        ),
      ),
    });
  });
}

import { BetterAuth, Database as AuthDatabase } from "@alchemy.run/better-auth";
import type { BetterAuthProps, DatabaseService } from "@alchemy.run/better-auth";
import { schema } from "@tranzfer/db";
import type { Principal } from "@tranzfer/contracts";
import { RuntimeContext } from "alchemy";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Cookies from "effect/http/Cookies";
import type * as HttpBody from "effect/http/HttpBody";
import type * as HttpServerError from "effect/http/HttpServerError";
import type * as HttpServerRequest from "effect/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/http/HttpServerResponse";

import { stagingLogin } from "./staging-login";

/** The session lookup failed inside better-auth. Its cause can hold tokens: never log it. */
export class AuthError extends Data.TaggedError("AuthError")<{ readonly cause: unknown }> {}

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
      { readonly cookies: Cookies.Cookies; readonly principal: Option.Option<Principal> },
      AuthError
    >;
  }
>()("tranzfer/Auth") {}

const SigningSecret = Schema.Redacted(Schema.String.check(Schema.isMinLength(32)));

// A copied .env.example leaves empty values behind; treat them as unset.
const optionalString = (name: string) =>
  Config.option(Config.String(name)).pipe(Config.map(Option.filter((value) => value !== "")));

const google = Config.all({
  clientId: optionalString("GOOGLE_CLIENT_ID"),
  clientSecret: optionalString("GOOGLE_CLIENT_SECRET"),
}).pipe(
  Config.map(({ clientId, clientSecret }) =>
    Option.all({ clientId, clientSecret }).pipe(
      Option.map((credentials) => ({ google: credentials })),
    ),
  ),
);

/**
 * What each stage signs in with. Production requires Google and never
 * registers the test login; the other stages take whatever is configured.
 */
const providers = (stage: "production" | "staging" | "dev") =>
  Match.value(stage).pipe(
    Match.when("production", () =>
      Effect.gen(function* productionProviders() {
        const secret = yield* Config.schema(SigningSecret, "BETTER_AUTH_SECRET");
        const socialProviders = yield* google;
        if (Option.isNone(socialProviders)) {
          return yield* Effect.die(new Error("Production needs Google sign-in configured"));
        }
        return {
          secret,
          socialProviders: socialProviders.value,
        } satisfies Partial<BetterAuthProps>;
      }),
    ),
    Match.orElse(() =>
      Effect.gen(function* stagingProviders() {
        // Unset lets the plugin provision a stable Random secret for the stage.
        const secret = yield* Config.option(Config.schema(SigningSecret, "BETTER_AUTH_SECRET"));
        const socialProviders = yield* google;
        const testLoginKey = yield* Config.option(Config.schema(SigningSecret, "TEST_LOGIN_KEY"));
        return {
          plugins: Option.toArray(
            Option.map(testLoginKey, (key) => stagingLogin(Redacted.value(key))),
          ),
          secret: Option.getOrUndefined(secret),
          socialProviders: Option.getOrUndefined(socialProviders),
        } satisfies Partial<BetterAuthProps>;
      }),
    ),
  );

export const makeAuth = (stage: "production" | "staging" | "dev", d1: Effect.Effect<D1Database>) =>
  Effect.gen(function* auth() {
    const configured = yield* providers(stage);
    const { origin } = yield* Config.schema(Schema.URLFromString, "APP_URL");

    // Our snake_case, integer-ms columns rule out the plugin's Kysely D1 layer.
    const authDatabase = Layer.succeed(AuthDatabase, {
      provider: "sqlite",
      runtime: d1.pipe(
        Effect.map((handle) => drizzleAdapter(drizzle(handle), { provider: "sqlite", schema })),
      ),
    } satisfies DatabaseService);

    const instance = yield* BetterAuth({
      ...configured,
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
      trustedOrigins: [origin],
    }).pipe(Effect.provide(authDatabase));

    return Auth.of({
      fetch: instance.fetch.pipe(Effect.provide(RuntimeContext.phantom)),
      session: Effect.fn("Auth.session")(function* session(headers: Headers) {
        const native = yield* instance.auth.pipe(Effect.provide(RuntimeContext.phantom));
        // getSession through the plugin can't return the renewed Set-Cookie.
        const result = yield* Effect.tryPromise({
          catch: (cause) => new AuthError({ cause }),
          try: async () => await native.api.getSession({ headers, returnHeaders: true }),
        });
        return {
          cookies: Cookies.fromSetCookie(result.headers.getSetCookie()),
          principal: Option.map(Option.fromNullishOr(result.response), ({ user }) => ({
            email: user.email,
            id: user.id,
            image: user.image ?? null,
            name: user.name,
          })),
        };
      }),
    });
  });

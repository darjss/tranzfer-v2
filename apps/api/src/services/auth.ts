import { BetterAuth, Database as AuthDatabase } from "@alchemy.run/better-auth";
import type { BetterAuthProps, DatabaseService } from "@alchemy.run/better-auth";
import { Principal } from "@tranzfer/contracts";
import { Database, schema } from "@tranzfer/db";
import { RuntimeContext } from "alchemy";
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
import { stagingLogin } from "./staging-login";

const SigningSecret = Schema.Redacted(Schema.String.check(Schema.isMinLength(32)));

type AuthFragment = Pick<BetterAuthProps, "plugins" | "secret" | "socialProviders">;

const makeAuth = (fragment: Effect.Effect<AuthFragment, Config.ConfigError | Schema.SchemaError>) =>
  Effect.gen(function* service() {
    const options = yield* fragment;
    const { origin } = yield* Config.schema(Schema.URLFromString, "APP_URL");

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
      trustedOrigins: [origin],
      ...options,
    };

    // Our snake_case / integer-ms columns rule out the plugin's Kysely D1
    // layer, so the Database service is built with the drizzleAdapter call
    // that helper wraps.
    const raw = yield* Database;
    const authDatabase = Layer.sync(AuthDatabase, (): DatabaseService => ({
      provider: "sqlite",
      runtime: raw.pipe(
        Effect.map((handle) => drizzleAdapter(drizzle(handle), { provider: "sqlite", schema })),
      ),
    }));

    const instance = yield* BetterAuth(props).pipe(Effect.provide(authDatabase));

    return {
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
    };
  });

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
  static readonly #make = (
    fragment: Effect.Effect<AuthFragment, Config.ConfigError | Schema.SchemaError>,
  ) => makeAuth(fragment).pipe(Effect.map(Auth.of));

  static readonly production = Auth.#make(
    Effect.map(
      Config.all({
        google: Config.all({
          clientId: Config.String("GOOGLE_CLIENT_ID"),
          clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
        }),
        secret: Config.schema(SigningSecret, "BETTER_AUTH_SECRET"),
      }),
      ({ google, secret }): AuthFragment => ({
        secret,
        socialProviders: {
          google: {
            clientId: google.clientId,
            clientSecret: Redacted.value(google.clientSecret),
          },
        },
      }),
    ),
  );

  static readonly staging = Auth.#make(
    Effect.map(Config.schema(SigningSecret, "TEST_LOGIN_KEY"), (key): AuthFragment => ({
      plugins: [stagingLogin(Redacted.value(key))],
    })),
  );

  static readonly dev = Auth.#make(
    Effect.gen(function* options() {
      const google = yield* Config.option(
        Config.all({
          clientId: Config.String("GOOGLE_CLIENT_ID"),
          clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
        }),
      );
      const key = yield* Config.option(Config.schema(SigningSecret, "TEST_LOGIN_KEY"));
      return {
        ...Option.match(google, {
          onNone: (): AuthFragment => ({}),
          onSome: ({ clientId, clientSecret }): AuthFragment => ({
            socialProviders: {
              google: { clientId, clientSecret: Redacted.value(clientSecret) },
            },
          }),
        }),
        ...Option.match(key, {
          onNone: (): AuthFragment => ({}),
          onSome: (value): AuthFragment => ({ plugins: [stagingLogin(Redacted.value(value))] }),
        }),
      };
    }),
  );
}

import { BetterAuth, Database as AuthDatabase } from "@alchemy.run/better-auth";
import type { BetterAuthProps, DatabaseService } from "@alchemy.run/better-auth";
import { schema } from "@tranzfer/db";
import { RateLimited, rateLimits } from "@tranzfer/contracts";
import type { Principal } from "@tranzfer/contracts";
import { RuntimeContext } from "alchemy";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getIP } from "better-auth/api";
import { and, desc, eq, gt } from "drizzle-orm";
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
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { secondsUntilRoom } from "../deliveries";
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

// Cloudflare sets this on every request at the edge; a client can't forge it,
// and the web Worker forwards the original headers over the service binding.
const ipAddress = { ipAddressHeaders: ["cf-connecting-ip"] };

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
const providers = (stage: "production" | "staging" | "dev", d1: Effect.Effect<D1Database>) =>
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
            Option.map(testLoginKey, (key) => stagingLogin(Redacted.value(key), d1)),
          ),
          secret: Option.getOrUndefined(secret),
          socialProviders: Option.getOrUndefined(socialProviders),
        } satisfies Partial<BetterAuthProps>;
      }),
    ),
  );

/**
 * `allowRequest` answers whether a client IP still fits
 * `rateLimits.authRequests`; it is checked before Better Auth sees a request.
 */
export const makeAuth = (
  stage: "production" | "staging" | "dev",
  d1: Effect.Effect<D1Database>,
  allowRequest: (ip: string) => Effect.Effect<boolean>,
) =>
  Effect.gen(function* auth() {
    const configured = yield* providers(stage, d1);
    // Better Auth's hooks are plain async callbacks; they reach D1 through
    // the services this Effect runs with.
    const services = yield* Effect.context();
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
      advanced: { database: { validateSchema: false }, ipAddress },
      basePath: "/api/auth",
      baseURL: origin,
      databaseHooks: {
        user: {
          create: {
            // New accounts per client IP. A creation outside a request has no
            // IP and is not counted. The OAuth callback turns this error into
            // a redirect to the error URL with the code and description.
            before: async (user, context) => {
              const headers = context?.headers;
              const ip = headers === undefined ? null : getIP(headers, { advanced: { ipAddress } });
              if (ip === null) {
                return { data: user };
              }
              const { newAccounts } = rateLimits;
              const now = Date.now();
              const recent = await drizzle(await Effect.runPromiseWith(services)(d1))
                .select({ createdAt: schema.user.createdAt })
                .from(schema.user)
                .where(
                  and(
                    eq(schema.user.signupIp, ip),
                    gt(schema.user.createdAt, new Date(now - newAccounts.windowSeconds * 1000)),
                  ),
                )
                .orderBy(desc(schema.user.createdAt))
                .limit(newAccounts.limit);
              const retryAfterSeconds = secondsUntilRoom(
                recent.map((row) => row.createdAt),
                newAccounts,
                now,
              );
              if (retryAfterSeconds !== undefined) {
                throw new APIError("TOO_MANY_REQUESTS", {
                  code: "RateLimited",
                  message: String(retryAfterSeconds),
                });
              }
              return { data: { ...user, signupIp: ip } };
            },
          },
        },
      },
      logger: {
        // Adapter error arguments can contain session tokens in SQL parameters.
        log: (level, message) => {
          console.error("Better Auth", level, message);
        },
      },
      migrate: false,
      // Sign-in errors land on the sign-in page, which shows the words.
      onAPIError: { errorURL: `${origin}/sign-in` },
      // Its stores are per isolate or per path; allowRequest limits instead.
      rateLimit: { enabled: false },
      trustedOrigins: [origin],
      user: {
        additionalFields: {
          signupIp: { input: false, required: false, returned: false, type: "string" },
        },
      },
    }).pipe(Effect.provide(authDatabase));

    return Auth.of({
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const ip = getIP(new Headers(request.headers), { advanced: { ipAddress } }) ?? "unknown";
        if (!(yield* allowRequest(ip))) {
          const { windowSeconds } = rateLimits.authRequests;
          return yield* HttpServerResponse.schemaJson(RateLimited)(
            new RateLimited({ limit: "authRequests", retryAfterSeconds: windowSeconds }),
            { headers: { "retry-after": String(windowSeconds) }, status: 429 },
          );
        }
        return yield* instance.fetch.pipe(Effect.provide(RuntimeContext.phantom));
      }).pipe(Effect.withSpan("Auth.fetch")),
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

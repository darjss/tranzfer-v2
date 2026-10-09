import { AsyncLocalStorage } from "node:async_hooks";

import { BetterAuth, Database as AuthDatabase } from "@alchemy.run/better-auth";
import type { BetterAuthProps, DatabaseService } from "@alchemy.run/better-auth";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import { RateLimited, rateLimits } from "@tranzfer/contracts";
import type { Principal } from "@tranzfer/contracts";
import { RuntimeContext } from "alchemy";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getIP } from "better-auth/api";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as Clock from "effect/Clock";
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
import { sendWelcome } from "../emails";
import type { Mail } from "./email";
import { stagingLogin } from "./staging-login";

/** The session lookup failed inside better-auth. Its cause can hold tokens: never log it. */
export class AuthError extends Data.TaggedError("AuthError")<{ readonly cause: unknown }> {}

export class Auth extends Context.Service<
  Auth,
  {
    readonly fetch: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      HttpServerError.HttpServerError | HttpBody.HttpBodyError,
      Database | HttpServerRequest.HttpServerRequest | Mail | Scope.Scope
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

/** The caller's IP as the rate limits count it: an IPv6 address by its /64. */
export const clientIp = (headers: Headers) =>
  getIP(headers, { advanced: { ipAddress } }) ?? "unknown";

// Better Auth calls hooks and plugin endpoints as Promise callbacks. Each auth
// request runs Better Auth inside its own store, so a callback reaches the
// services and abort signal of the request that triggered it.
const authRequests = new AsyncLocalStorage<{
  readonly context: Context.Context<Database | Mail>;
  readonly signal: AbortSignal;
}>();

/**
 * Runs an Effect from a Better Auth callback (a database hook, a plugin
 * endpoint) with the services and abort signal of the auth request that
 * triggered it. To make Better Auth answer with an error, fail with its
 * `APIError`; any other failure rejects as a defect.
 */
export const runAuthCallback = async <A, E>(effect: Effect.Effect<A, E, Database | Mail>) => {
  const current = authRequests.getStore();
  if (current === undefined) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Auth callbacks run only inside an auth request",
    });
  }
  return await Effect.runPromiseWith(current.context)(effect, { signal: current.signal });
};

/**
 * Counts one new account for a client IP, or fails with how long until the
 * IP has room under `rateLimits.newAccounts`. The statement that counts the
 * IP's recent sign-ups is the one that adds this one, so concurrent sign-ups
 * can't pass the cap.
 */
export const admitSignup = Effect.fn("Auth.admitSignup")(function* admitSignup(ip: string) {
  const { db } = yield* Database;
  const { newAccounts } = rateLimits;
  const now = yield* Clock.currentTimeMillis;
  const since = new Date(now - newAccounts.windowSeconds * 1000);
  const recent = and(eq(schema.signup.ip, ip), gt(schema.signup.createdAt, since));
  const [admitted] = yield* db
    .insert(schema.signup)
    .select((qb) =>
      qb
        .select({
          createdAt: sql<Date>`${now}`.as("created_at"),
          ip: sql<string>`${ip}`.as("ip"),
        })
        .from(sql`(select 1)`)
        .where(lt(sql`(select count(*) from ${schema.signup} where ${recent})`, newAccounts.limit)),
    )
    .returning();
  if (admitted !== undefined) {
    return admitted;
  }
  const newestFirst = yield* db
    .select({ createdAt: schema.signup.createdAt })
    .from(schema.signup)
    .where(recent)
    .orderBy(desc(schema.signup.createdAt))
    .limit(newAccounts.limit);
  return yield* new RateLimited({
    limit: "newAccounts",
    // The insert just found the window full, so the wait is always there.
    retryAfterSeconds:
      secondsUntilRoom(
        newestFirst.map((row) => row.createdAt),
        newAccounts,
        now,
      ) ?? newAccounts.windowSeconds,
  });
}, dieOnDatabaseError);

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
            // The plugin hands Better Auth's background tasks to the
            // request's waitUntil, so sign-up never waits on the welcome
            // email, and the welcome never fails.
            after: async (user, context) => {
              await context?.context.runInBackgroundOrAwait(
                runAuthCallback(sendWelcome(user.email, origin)),
              );
            },
            // New accounts per client IP. A creation outside a request has no
            // IP and is not counted. The OAuth callback turns this error into
            // a redirect to the error URL with the code and description.
            before: async (_user, context) => {
              const headers = context?.headers;
              const ip = headers === undefined ? null : getIP(headers, { advanced: { ipAddress } });
              if (ip !== null) {
                await runAuthCallback(
                  admitSignup(ip).pipe(
                    Effect.catchTag("RateLimited", ({ retryAfterSeconds }) =>
                      Effect.fail(
                        new APIError("TOO_MANY_REQUESTS", {
                          code: "RateLimited",
                          message: String(retryAfterSeconds),
                        }),
                      ),
                    ),
                  ),
                );
              }
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
    }).pipe(Effect.provide(authDatabase));

    return Auth.of({
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        if (!(yield* allowRequest(clientIp(new Headers(request.headers))))) {
          const { windowSeconds } = rateLimits.authRequests;
          return yield* HttpServerResponse.schemaJson(RateLimited)(
            new RateLimited({ limit: "authRequests", retryAfterSeconds: windowSeconds }),
            { headers: { "retry-after": String(windowSeconds) }, status: 429 },
          );
        }
        const native = yield* instance.auth.pipe(Effect.provide(RuntimeContext.phantom));
        const web = yield* HttpServerRequest.toWeb(request).pipe(Effect.orDie);
        const context = yield* Effect.context<Database | Mail>();
        // Better Auth answers API errors as responses; it rejects only on defects.
        const response = yield* Effect.promise(
          async (signal) =>
            await authRequests.run({ context, signal }, async () => await native.handler(web)),
        );
        return HttpServerResponse.fromWeb(response);
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

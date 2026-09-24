import { Principal } from "@tranzfer/contracts";
import { Drizzle, schema } from "@tranzfer/db";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Environment } from "effect-cf";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Cookies from "effect/unstable/http/Cookies";

import { AuthError } from "./auth-error";

export class Auth extends Context.Service<
  Auth,
  {
    readonly handler: (request: Request) => Effect.Effect<Response>;
    readonly session: (
      headers: Headers,
    ) => Effect.Effect<
      { cookies: Cookies.Cookies; principal: Option.Option<Principal> },
      AuthError
    >;
  }
>()("tranzfer/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* makeAuth() {
      const env = yield* Environment.WorkerEnvironment;
      const drizzle_ = yield* Drizzle;
      const config = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          APP_URL: Schema.NonEmptyString,
          BETTER_AUTH_SECRET: Schema.NonEmptyString,
          GOOGLE_CLIENT_ID: Schema.NonEmptyString,
          GOOGLE_CLIENT_SECRET: Schema.NonEmptyString,
        }),
      )(env);
      const auth = betterAuth({
        basePath: "/api/auth",
        baseURL: config.APP_URL,
        database: drizzleAdapter(drizzle_.db, { provider: "sqlite", schema }),
        logger: {
          // Adapter error arguments can contain session tokens in SQL parameters.
          log: (level, message) => {
            console.error("Better Auth", level, message);
          },
        },
        secret: config.BETTER_AUTH_SECRET,
        socialProviders: {
          google: {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
          },
        },
        trustedOrigins: [config.APP_URL],
      } satisfies BetterAuthOptions);
      return Auth.of({
        handler: (request) => Effect.promise(async () => await auth.handler(request)),
        session: Effect.fn("Auth.session")((headers: Headers) =>
          Effect.tryPromise({
            catch: (cause) => new AuthError({ cause, op: "session" }),
            try: async () => await auth.api.getSession({ headers, returnHeaders: true }),
          }).pipe(
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
    }),
  ).pipe(Layer.provide(Drizzle.layer));
}

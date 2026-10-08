import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { schema } from "@tranzfer/db";
import { drizzle } from "drizzle-orm/d1";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

// A real domain: Polar's checkout rejects reserved ones such as .test.
const testerEmail = "staging@tranzfer.app";

// Lets testers sign in on staging and local stages without OAuth, on the
// Studio plan so release gates can send hundreds of GB without Polar.
// Production never registers this plugin, so neither the login nor the grant
// exists there.
export const stagingLogin = (key: string, d1: Effect.Effect<D1Database>): BetterAuthPlugin => ({
  endpoints: {
    stagingLogin: createAuthEndpoint(
      "/staging-login",
      {
        body: Schema.toStandardSchemaV1(Schema.Struct({ key: Schema.String })),
        method: "POST",
      },
      async (ctx) => {
        const expected = new TextEncoder().encode(key);
        const supplied = new TextEncoder().encode(ctx.body.key);
        if (
          supplied.length !== expected.length ||
          !crypto.subtle.timingSafeEqual(supplied, expected)
        ) {
          throw new APIError("UNAUTHORIZED", { message: "Invalid staging login key" });
        }
        const adapter = ctx.context.internalAdapter;
        const existing = await adapter.findUserByEmail(testerEmail);
        const user =
          existing?.user ??
          // A concurrent login can win the unique-email insert; re-find.
          (await adapter
            .createUser(
              {
                createdAt: new Date(),
                email: testerEmail,
                emailVerified: true,
                name: "Staging tester",
                updatedAt: new Date(),
              },
              { method: "staging-login" },
            )
            .catch(async () => {
              const refound = await adapter.findUserByEmail(testerEmail);
              return refound?.user;
            }));
        if (user === undefined) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Staging login failed" });
        }
        const grant = { plan: "studio", status: "comp", userId: user.id } as const;
        await drizzle(await Effect.runPromise(d1))
          .insert(schema.subscription)
          .values(grant)
          .onConflictDoUpdate({ set: grant, target: schema.subscription.userId });
        const session = await adapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return await ctx.json({ user });
      },
    ),
  },
  id: "staging-login",
});

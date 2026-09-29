import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import * as Schema from "effect/Schema";

// Lets testers sign in on staging and local stages without OAuth. Production
// never registers this plugin.
export const stagingLogin = (key: string): BetterAuthPlugin => ({
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
        const existing = await adapter.findUserByEmail("staging@tranzfer.test");
        const user =
          existing?.user ??
          // A concurrent login can win the unique-email insert; re-find.
          (await adapter
            .createUser(
              {
                createdAt: new Date(),
                email: "staging@tranzfer.test",
                emailVerified: true,
                name: "Staging tester",
                updatedAt: new Date(),
              },
              { method: "staging-login" },
            )
            .catch(async () => {
              const refound = await adapter.findUserByEmail("staging@tranzfer.test");
              return refound?.user;
            }));
        if (user === undefined) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Staging login failed" });
        }
        const session = await adapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return await ctx.json({ user });
      },
    ),
  },
  id: "staging-login",
});

import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { brandedUserIdRule } from "./branded-user-id.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/branded-user-id", brandedUserIdRule, {
  invalid: [
    { code: "const load = (userId: string) => userId;", errors: [{ messageId: "userId" }] },
    { code: "interface Row { readonly ownerId: string }", errors: [{ messageId: "userId" }] },
    { code: "type Row = { senderId?: string };", errors: [{ messageId: "userId" }] },
    { code: "class Row { senderId: string = ''; }", errors: [{ messageId: "userId" }] },
    { code: "let userId: string;", errors: [{ messageId: "userId" }] },
    { code: "type Row = { userId: string | null };", errors: [{ messageId: "userId" }] },
  ],
  valid: [
    "const load = (userId: UserId) => userId;",
    "interface Row { readonly ownerId: UserId }",
    "const load = (email: string) => email;",
    "const load = (userIds: readonly string[]) => userIds;",
    "type Row = { userId: UserId | null };",
  ],
});

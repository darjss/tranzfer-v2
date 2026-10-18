import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { brandedLinkTokenRule } from "./branded-link-token.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/branded-link-token", brandedLinkTokenRule, {
  invalid: [
    { code: "Schema.Struct({ token: Schema.String });", errors: [{ messageId: "token" }] },
    {
      code: "Schema.Struct({ unlock: Schema.optional(Schema.String) });",
      errors: [{ messageId: "token" }],
    },
    { code: "Schema.Struct({ 'token': Schema.String });", errors: [{ messageId: "token" }] },
  ],
  valid: [
    "Schema.Struct({ token: LinkToken });",
    "Schema.Struct({ unlock: Schema.optional(UnlockToken) });",
    "Schema.Struct({ name: Schema.String });",
    "const payload = { token: 'abc' };",
  ],
});

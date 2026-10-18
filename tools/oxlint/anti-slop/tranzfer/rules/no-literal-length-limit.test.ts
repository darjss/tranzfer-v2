import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { noLiteralLengthLimitRule } from "./no-literal-length-limit.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true }, lang: "tsx" } },
});

tester.run("tranzfer/no-literal-length-limit", noLiteralLengthLimitRule, {
  invalid: [
    { code: "<input maxlength={120} />;", errors: [{ messageId: "literal" }] },
    { code: '<input maxlength="254" />;', errors: [{ messageId: "literal" }] },
    { code: "<textarea maxLength={1000} />;", errors: [{ messageId: "literal" }] },
    { code: "<input minlength={8} />;", errors: [{ messageId: "literal" }] },
  ],
  valid: [
    "<input maxlength={maxEmailLength} />;",
    "<input minlength={passwordLength.min} />;",
    "<input max={10} />;",
  ],
});

import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { noCountSubqueryStringRule } from "./no-count-subquery-string.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/no-count-subquery-string", noCountSubqueryStringRule, {
  invalid: [
    {
      code: "const q = sql`(select count(*) from ${schema.signup} where ${recent})`;",
      errors: [{ messageId: "countSubquery" }],
    },
    {
      code: "const q = sql`(SELECT COUNT( * ) FROM ${schema.delivery})`;",
      errors: [{ messageId: "countSubquery" }],
    },
    {
      code: "const q = sql`${mine} + ${n} <= (select\n count(*) from ${schema.x})`;",
      errors: [{ messageId: "countSubquery" }],
    },
  ],
  valid: [
    "const q = db.$count(schema.signup, recent);",
    "const q = sql`count(${schema.download.savedAt})`;",
    "const q = sql`count(distinct ${schema.delivery.id})`;",
    "const q = sql`select 1`;",
    "const q = other`select count(*) from t`;",
    "const q = `select count(*) from t`;",
  ],
});

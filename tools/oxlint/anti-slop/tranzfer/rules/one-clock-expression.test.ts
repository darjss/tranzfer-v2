import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { oneClockExpressionRule } from "./one-clock-expression.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/one-clock-expression", oneClockExpressionRule, {
  invalid: [
    {
      code: "const databaseNow = sql`cast(unixepoch('subsecond') * 1000 as integer)`;",
      errors: [{ messageId: "clock" }],
    },
    {
      code: "const column = integer('created_at').default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);",
      errors: [{ messageId: "clock" }],
    },
    {
      code: "const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;",
      errors: [{ messageId: "clock" }],
    },
    {
      code: "export const later = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;",
      errors: [{ messageId: "clock" }],
    },
    {
      code: "const query = sql`max(${now}, UNIXEPOCH('subsecond'))`;",
      errors: [{ messageId: "clock" }],
    },
  ],
  valid: [
    "export const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;",
    "const latest = (now: number) => sql`max(${now}, ${schema.nowMs})`;",
    "const text = `unixepoch('subsecond')`;",
    "const query = other`unixepoch('subsecond')`;",
    "const query = sql`select 1`;",
  ],
});

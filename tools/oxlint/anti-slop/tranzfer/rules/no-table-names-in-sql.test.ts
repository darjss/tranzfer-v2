import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { noTableNamesInSqlRule } from "./no-table-names-in-sql.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/no-table-names-in-sql", noTableNamesInSqlRule, {
  invalid: [
    {
      code: "const q = sql`EXISTS (SELECT 1 FROM transfer WHERE transfer.delivery_id = ${id})`;",
      errors: [{ messageId: "bareTable" }],
    },
    {
      code: "const q = sql`NOT EXISTS (select 1 from transfer where transfer.state != 'complete')`;",
      errors: [{ messageId: "bareTable" }],
    },
    {
      code: 'const q = sql`select 1 from "delivery"`;',
      errors: [{ messageId: "bareTable" }],
    },
    {
      code: "const q = sql`select 1 from\n  delivery where ${id}`;",
      errors: [{ messageId: "bareTable" }],
    },
    {
      code: "const q = sql`select ${a} from delivery`;",
      errors: [{ messageId: "bareTable" }],
    },
  ],
  valid: [
    "const q = sql`exists (select 1 from ${schema.fileRequest} where ${filter})`;",
    "const q = sql`(select value from json_each(${json}))`;",
    "const q = sql`json_each(${json})`;",
    "const q = sql`(select 1)`;",
    "const q = sql`select 1 from (select 2)`;",
    "const q = sql`SELECT 1`;",
    "const q = sql`${now} + ${days} * ${DAY_MS}`;",
    "const q = other`select 1 from transfer`;",
    "const q = `select 1 from transfer`;",
  ],
});

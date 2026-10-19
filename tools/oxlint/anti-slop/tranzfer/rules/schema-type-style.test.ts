import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { schemaTypeStyleRule } from "./schema-type-style.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/schema-type-style", schemaTypeStyleRule, {
  invalid: [
    {
      code: "export interface Delivery extends Schema.Schema.Type<typeof Delivery> {}",
      errors: [{ messageId: "typeForm" }],
      output: "export type Delivery = typeof Delivery.Type;",
    },
    {
      code: "interface Delivery extends Schema.Schema.Type<typeof Delivery> { extra: string }",
      errors: [{ messageId: "typeForm" }],
      output: null,
    },
  ],
  valid: [
    "export type Delivery = typeof Delivery.Type;",
    "interface Storage { put(key: string): void }",
    "interface Row extends Base {}",
  ],
});

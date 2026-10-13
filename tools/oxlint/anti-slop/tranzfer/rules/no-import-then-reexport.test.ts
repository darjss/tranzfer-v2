import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { noImportThenReexportRule } from "./no-import-then-reexport.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/no-import-then-reexport", noImportThenReexportRule, {
  invalid: [
    {
      code: 'import { A } from "./worker"; export { A } from "./worker";',
      errors: [{ messageId: "duplicate" }],
    },
    {
      code: 'export { A } from "./worker"; import { A } from "./worker";',
      errors: [{ messageId: "duplicate" }],
    },
    {
      code: 'import { A } from "./worker"; export { A as B } from "./worker";',
      errors: [{ messageId: "duplicate" }],
    },
    {
      code: 'import type { A } from "./worker"; export type { A } from "./worker";',
      errors: [{ messageId: "duplicate" }],
    },
    {
      code: 'import { A } from "./worker"; export { A };',
      errors: [{ messageId: "importOnlyToExport" }],
    },
    {
      code: 'import { A, B } from "./worker"; export { A, B };',
      errors: [{ messageId: "importOnlyToExport" }, { messageId: "importOnlyToExport" }],
    },
    {
      code: 'import * as ns from "./worker"; export { ns };',
      errors: [{ messageId: "importOnlyToExport" }],
    },
    {
      code: 'import A from "./worker"; export { A };',
      errors: [{ messageId: "importOnlyToExport" }],
    },
    {
      code: 'import { A } from "./worker"; export { A as B };',
      errors: [{ messageId: "importOnlyToExport" }],
    },
  ],
  valid: [
    'export { A } from "./worker";',
    'import { A } from "./worker"; export const B = A;',
    'import { A } from "./worker"; export { A }; export const B = A;',
    'import { A } from "./worker"; export { B } from "./other";',
    'import { A } from "./worker"; export { B } from "./worker";',
    'import { A } from "./worker"; export { A } from "./other";',
    'import { A } from "./worker"; const B = A; export { B };',
    "const local = 1; export { local };",
  ],
});

import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { noDebugMarkersInTestsRule } from "./no-debug-markers-in-tests.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const marker = { messageId: "marker" };
const logged = { messageId: "console" };

tester.run("tranzfer/no-debug-markers-in-tests", noDebugMarkersInTestsRule, {
  invalid: [
    { code: "const REPRO = 1;", errors: [marker], filename: "src/app.test.ts" },
    { code: "const REPRO1 = 1;", errors: [marker], filename: "src/app.spec.tsx" },
    { code: 'const name = "REPRO2 case";', errors: [marker], filename: "src/app.test.ts" },
    { code: "const name = `REPRO3 ${1}`;", errors: [marker], filename: "src/app.test.ts" },
    { code: "// REPRO\nconst a = 1;", errors: [marker], filename: "src/app.test.ts" },
    { code: "/* REPRO1 */ const a = 1;", errors: [marker], filename: "src/app.test.ts" },
    { code: "console.log(1);", errors: [logged], filename: "src/app.test.ts" },
    { code: "console.log(REPRO);", errors: [logged, marker], filename: "src/app.test.ts" },
  ],
  valid: [
    { code: "const REPRO = 1; console.log(REPRO);", filename: "src/app.ts" },
    { code: "const value = 1; expect(value).toBe(1);", filename: "src/app.test.ts" },
    { code: 'const note = "reproduces the bug";', filename: "src/app.test.ts" },
    { code: "const REPROS = 1; const NOREPRO = 2;", filename: "src/app.spec.ts" },
    { code: "// the repro steps are in the PR\nconst a = 1;", filename: "src/app.test.ts" },
    { code: "logger.log(1); console.error(1);", filename: "src/app.test.ts" },
  ],
});

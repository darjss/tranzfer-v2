import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";

import { noSilentIgnoreRule } from "./no-silent-ignore.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

tester.run("tranzfer/no-silent-ignore", noSilentIgnoreRule, {
  invalid: [
    { code: "task.pipe(Effect.ignore);", errors: [{ messageId: "silent" }] },
    { code: "Effect.ignore(task);", errors: [{ messageId: "silent" }] },
    { code: "task.pipe(Effect.ignore());", errors: [{ messageId: "silent" }] },
    { code: "task.pipe(Effect.ignore({ log: false }));", errors: [{ messageId: "silent" }] },
    { code: "Effect.ignore(task, { message: 'x' });", errors: [{ messageId: "silent" }] },
  ],
  valid: [
    "task.pipe(Effect.ignore({ log: true }));",
    "task.pipe(Effect.ignore({ log: 'Warn', message: 'x' }));",
    "Effect.ignore(task, { log: true });",
    "task.pipe(Effect.ignoreCause);",
  ],
});

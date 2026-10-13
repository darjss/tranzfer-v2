import { eslintCompatPlugin } from "vite-plus/lint/plugins";

import { noDebugMarkersInTestsRule } from "./rules/no-debug-markers-in-tests.ts";
import { noImportThenReexportRule } from "./rules/no-import-then-reexport.ts";

/** Rules written for this repo, for patterns that cost us time more than once. */
const tranzferPlugin = eslintCompatPlugin({
  meta: { name: "tranzfer" },
  rules: {
    "no-debug-markers-in-tests": noDebugMarkersInTestsRule,
    "no-import-then-reexport": noImportThenReexportRule,
  },
});

export default tranzferPlugin;

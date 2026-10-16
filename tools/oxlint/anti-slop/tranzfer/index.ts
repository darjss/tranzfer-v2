import { eslintCompatPlugin } from "vite-plus/lint/plugins";

import { brandedLinkTokenRule } from "./rules/branded-link-token.ts";
import { brandedUserIdRule } from "./rules/branded-user-id.ts";
import { noDebugMarkersInTestsRule } from "./rules/no-debug-markers-in-tests.ts";
import { noCountSubqueryStringRule } from "./rules/no-count-subquery-string.ts";
import { noImportThenReexportRule } from "./rules/no-import-then-reexport.ts";
import { noTableNamesInSqlRule } from "./rules/no-table-names-in-sql.ts";
import { oneClockExpressionRule } from "./rules/one-clock-expression.ts";

/** Rules written for this repo, for patterns that cost us time more than once. */
const tranzferPlugin = eslintCompatPlugin({
  meta: { name: "tranzfer" },
  rules: {
    "branded-link-token": brandedLinkTokenRule,
    "branded-user-id": brandedUserIdRule,
    "no-count-subquery-string": noCountSubqueryStringRule,
    "no-debug-markers-in-tests": noDebugMarkersInTestsRule,
    "no-import-then-reexport": noImportThenReexportRule,
    "no-table-names-in-sql": noTableNamesInSqlRule,
    "one-clock-expression": oneClockExpressionRule,
  },
});

export default tranzferPlugin;

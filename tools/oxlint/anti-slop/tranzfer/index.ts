import { eslintCompatPlugin } from "vite-plus/lint/plugins";

import { brandedLinkTokenRule } from "./rules/branded-link-token.ts";
import { brandedUserIdRule } from "./rules/branded-user-id.ts";
import { noDebugMarkersInTestsRule } from "./rules/no-debug-markers-in-tests.ts";
import { noCountSubqueryStringRule } from "./rules/no-count-subquery-string.ts";
import { noImportThenReexportRule } from "./rules/no-import-then-reexport.ts";
import { noLiteralLengthLimitRule } from "./rules/no-literal-length-limit.ts";
import { noSilentIgnoreRule } from "./rules/no-silent-ignore.ts";
import { noTableNamesInSqlRule } from "./rules/no-table-names-in-sql.ts";
import { oneClockExpressionRule } from "./rules/one-clock-expression.ts";
import { schemaTypeStyleRule } from "./rules/schema-type-style.ts";

/** Rules written for this repo, for patterns that cost us time more than once. */
const tranzferPlugin = eslintCompatPlugin({
  meta: { name: "tranzfer" },
  rules: {
    "branded-link-token": brandedLinkTokenRule,
    "branded-user-id": brandedUserIdRule,
    "no-count-subquery-string": noCountSubqueryStringRule,
    "no-debug-markers-in-tests": noDebugMarkersInTestsRule,
    "no-import-then-reexport": noImportThenReexportRule,
    "no-literal-length-limit": noLiteralLengthLimitRule,
    "no-silent-ignore": noSilentIgnoreRule,
    "no-table-names-in-sql": noTableNamesInSqlRule,
    "one-clock-expression": oneClockExpressionRule,
    "schema-type-style": schemaTypeStyleRule,
  },
});

export default tranzferPlugin;

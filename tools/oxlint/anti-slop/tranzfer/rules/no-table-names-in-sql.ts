import { defineRule } from "vite-plus/lint/plugins";

// `from` followed by a bare identifier. `from ${table}` ends the text chunk
// after the space, `from (` is a subquery, and json_each is a table-valued function.
const BARE_TABLE = /\bfrom\s+(?!json_each\b)[a-z_"`[]/iu;

/** A table name in a sql string is not checked by the compiler, so a rename breaks it only on D1. */
export const noTableNamesInSqlRule = defineRule({
  createOnce(context) {
    return {
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
        if (node.quasi.quasis.some((quasi) => BARE_TABLE.test(quasi.value.raw))) {
          context.report({ messageId: "bareTable", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description: "Disallow a hard-coded table name after `from` in a sql template.",
    },
    messages: {
      bareTable:
        "This sql string names a table. Use exists()/notExists() or db.$count() over the schema table so a rename fails the type check, or interpolate the table with ${schema.x}.",
    },
    type: "problem",
  },
});

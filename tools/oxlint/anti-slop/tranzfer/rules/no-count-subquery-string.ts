import { defineRule } from "vite-plus/lint/plugins";

const COUNT_SUBQUERY = /\bselect\s+count\s*\(\s*\*\s*\)/iu;

/** `db.$count(table, filter)` renders the same scalar subquery from the typed schema. */
export const noCountSubqueryStringRule = defineRule({
  createOnce(context) {
    return {
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
        if (node.quasi.quasis.some((quasi) => COUNT_SUBQUERY.test(quasi.value.raw))) {
          context.report({ messageId: "countSubquery", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description: "Disallow `select count(*)` written inside a sql template.",
    },
    messages: {
      countSubquery:
        "Write this count as db.$count(table, filter), which renders the same subquery from the schema.",
    },
    type: "problem",
  },
});

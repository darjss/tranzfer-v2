import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const CLOCK = /\bunixepoch\s*\(/iu;

const isExportedNowMs = (node: ESTree.TaggedTemplateExpression) => {
  const declarator = node.parent;
  return (
    declarator?.type === "VariableDeclarator" &&
    declarator.id.type === "Identifier" &&
    declarator.id.name === "nowMs" &&
    declarator.parent?.parent?.type === "ExportNamedDeclaration"
  );
};

/** The database clock is one exported expression, so every default and comparison agrees on it. */
export const oneClockExpressionRule = defineRule({
  createOnce(context) {
    return {
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
        if (!node.quasi.quasis.some((quasi) => CLOCK.test(quasi.value.raw))) return;
        if (isExportedNowMs(node)) return;
        context.report({ messageId: "clock", node });
      },
    };
  },
  meta: {
    docs: {
      description: "Allow `unixepoch(` in a sql template only inside the exported `nowMs`.",
    },
    messages: {
      clock:
        "The database clock is written once, as the exported `nowMs` in packages/db/src/schema.ts. Import it instead of spelling `unixepoch(` again.",
    },
    type: "problem",
  },
});

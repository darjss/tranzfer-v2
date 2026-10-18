import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const logs = (options: ESTree.Node | undefined) =>
  options?.type === "ObjectExpression" &&
  options.properties.some(
    (property) =>
      property.type === "Property" &&
      property.key.type === "Identifier" &&
      property.key.name === "log" &&
      !(property.value.type === "Literal" && property.value.value === false),
  );

/** A failure that `Effect.ignore` swallows should still leave a log line behind. */
export const noSilentIgnoreRule = defineRule({
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type !== "Identifier" ||
          node.object.name !== "Effect" ||
          node.property.type !== "Identifier" ||
          node.property.name !== "ignore"
        ) {
          return;
        }
        const call = node.parent;
        if (call.type === "CallExpression" && call.callee === node) {
          // `Effect.ignore(options)` in a pipe, or `Effect.ignore(effect, options)`.
          const [first, second] = call.arguments;
          if (logs(first) || logs(second)) return;
        }
        context.report({ messageId: "silent", node });
      },
    };
  },
  meta: {
    docs: {
      description: "Require `{ log: true }` (or a log level) on `Effect.ignore`.",
    },
    messages: {
      silent:
        "`Effect.ignore` drops the failure without a trace. Pass `{ log: true }` so the cause is logged.",
    },
    type: "problem",
  },
});

import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const isSchemaString = (node: ESTree.Node | undefined) =>
  node?.type === "MemberExpression" &&
  node.object.type === "Identifier" &&
  node.object.name === "Schema" &&
  node.property.type === "Identifier" &&
  node.property.name === "String";

const keyName = (key: ESTree.PropertyKey) => {
  if (key.type === "Identifier") return key.name;
  return key.type === "Literal" ? key.value : undefined;
};

/** Link and unlock tokens are branded in the contracts, so a handler can't take one for the other. */
export const brandedLinkTokenRule = defineRule({
  createOnce(context) {
    return {
      Property(node) {
        const name = keyName(node.key);
        if (name !== "token" && name !== "unlock") return;
        // `Schema.optional(Schema.String)` is the same bare string, wrapped.
        const value = node.value.type === "CallExpression" ? node.value.arguments[0] : node.value;
        if (!isSchemaString(value)) return;
        context.report({ data: { name }, messageId: "token", node: node.value });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow a bare `Schema.String` for a `token` or `unlock` field in the contracts.",
    },
    messages: {
      token:
        "`{{name}}` carries a link secret. Use `LinkToken` or `UnlockToken` from link.ts, not `Schema.String`.",
    },
    type: "problem",
  },
});

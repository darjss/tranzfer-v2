import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const USER_ID = /^(?:ownerId|senderId|userId)$/u;

const annotatedName = (node: ESTree.Node | null | undefined) => {
  if (node?.type === "Identifier") return node.name;
  if (
    (node?.type === "TSPropertySignature" || node?.type === "PropertyDefinition") &&
    node.key.type === "Identifier"
  ) {
    return node.key.name;
  }
  return undefined;
};

/** A user id is a `UserId` from the session to the database column, never a bare string. */
export const brandedUserIdRule = defineRule({
  createOnce(context) {
    return {
      TSStringKeyword(node) {
        // `string | null` is still a bare string id.
        const type = node.parent?.type === "TSUnionType" ? node.parent : node;
        const annotation = type.parent;
        if (annotation?.type !== "TSTypeAnnotation") return;
        const name = annotatedName(annotation.parent);
        if (name === undefined || !USER_ID.test(name)) return;
        context.report({ data: { name }, messageId: "userId", node });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow `string` on a parameter or property named userId, ownerId or senderId.",
    },
    messages: {
      userId: "`{{name}}` is a user id. Type it `UserId` from @tranzfer/contracts, not `string`.",
    },
    type: "problem",
  },
});

import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const lengthAttributes = new Set(["maxlength", "maxLength", "minlength", "minLength"]);

const isNumber = (value: ESTree.JSXAttribute["value"]) => {
  const literal = value?.type === "JSXExpressionContainer" ? value.expression : value;
  return literal?.type === "Literal" && /^\d+$/u.test(String(literal.value));
};

/** An input's length limit copies the schema that checks it on the server. */
export const noLiteralLengthLimitRule = defineRule({
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.type === "JSXIdentifier" &&
          lengthAttributes.has(node.name.name) &&
          isNumber(node.value)
        ) {
          context.report({ messageId: "literal", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description: "Read input length limits from the contract constant their schema uses.",
    },
    messages: {
      literal:
        "This number copies a schema limit and drifts when the schema changes. Export the limit from @tranzfer/contracts next to its schema and read it here.",
    },
    type: "problem",
  },
});

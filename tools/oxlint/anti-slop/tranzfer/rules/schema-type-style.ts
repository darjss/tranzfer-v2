import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const isSchemaSchemaType = (node: ESTree.Expression) =>
  node.type === "MemberExpression" &&
  node.object.type === "MemberExpression" &&
  node.object.object.type === "Identifier" &&
  node.object.object.name === "Schema" &&
  node.object.property.type === "Identifier" &&
  node.object.property.name === "Schema" &&
  node.property.type === "Identifier" &&
  node.property.name === "Type";

/** docs/CONVENTIONS.md "Types come from values": a schema's type is `typeof X.Type`. */
export const schemaTypeStyleRule = defineRule({
  createOnce(context) {
    return {
      TSInterfaceDeclaration(node) {
        const [heritage] = node.extends;
        if (node.extends.length !== 1 || heritage === undefined) return;
        if (!isSchemaSchemaType(heritage.expression)) return;
        const name = node.id.name;
        context.report({
          data: { name },
          fix: (fixer) =>
            node.body.body.length === 0
              ? fixer.replaceText(node, `type ${name} = typeof ${name}.Type;`)
              : null,
          messageId: "typeForm",
          node,
        });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow `interface X extends Schema.Schema.Type<typeof X>`; use `type X = typeof X.Type`.",
    },
    fixable: "code",
    messages: {
      typeForm:
        "Write `type {{name}} = typeof {{name}}.Type` (docs/CONVENTIONS.md, Types come from values).",
    },
    type: "suggestion",
  },
});

import { defineRule } from "vite-plus/lint/plugins";

import { resolveVariable } from "../../shared/scope.ts";

import type { ESTree } from "vite-plus/lint/plugins";

const exportedName = (name: ESTree.ModuleExportName) =>
  name.type === "Identifier" ? name.name : name.value;

const importedName = (specifier: ESTree.ImportDeclarationSpecifier) => {
  if (specifier.type === "ImportSpecifier") return exportedName(specifier.imported);
  return specifier.type === "ImportDefaultSpecifier" ? "default" : "*";
};

/** A module that imports a binding and re-exports it from the same place says it twice. */
export const noImportThenReexportRule = defineRule({
  createOnce(context) {
    const imported = new Set<string>();
    const reexports: { name: string; source: string; specifier: ESTree.ExportSpecifier }[] = [];

    return {
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (node.source !== null) {
            reexports.push({
              name: exportedName(specifier.local),
              source: node.source.value,
              specifier,
            });
            continue;
          }
          if (specifier.local.type !== "Identifier") continue;
          const variable = resolveVariable(context.sourceCode, specifier.local);
          const definition = variable?.defs[0];
          if (
            variable === null ||
            definition?.type !== "ImportBinding" ||
            definition.parent?.type !== "ImportDeclaration"
          ) {
            continue;
          }
          const usedHere = variable.references.some(
            (reference) => reference.identifier !== specifier.local,
          );
          if (!usedHere) {
            context.report({
              data: { name: specifier.local.name, source: definition.parent.source.value },
              messageId: "importOnlyToExport",
              node: specifier,
            });
          }
        }
      },
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          imported.add(`${node.source.value}\0${importedName(specifier)}`);
        }
      },
      "Program:exit"() {
        for (const { name, source, specifier } of reexports) {
          if (imported.has(`${source}\0${name}`)) {
            context.report({ data: { name, source }, messageId: "duplicate", node: specifier });
          }
        }
      },
      before() {
        imported.clear();
        reexports.length = 0;
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow importing a binding from a module and re-exporting the same binding from it too.",
    },
    messages: {
      duplicate:
        'Imports "{{name}}" from "{{source}}" and also re-exports it from there. Keep one: `export { {{name}} }` of the import when this module uses it, or `export { {{name}} } from` alone when it does not.',
      importOnlyToExport:
        '"{{name}}" is imported only to be re-exported. Re-export it with `export ... from "{{source}}"` and drop the import.',
    },
    type: "problem",
  },
});

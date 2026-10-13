import { defineRule } from "vite-plus/lint/plugins";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const MARKER = /\bREPRO\d*\b/u;

/** Debug scaffolding from a bug hunt, which belongs in a PR description and not in a test. */
export const noDebugMarkersInTestsRule = defineRule({
  createOnce(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "console" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "log"
        ) {
          context.report({ messageId: "console", node });
        }
      },
      Identifier(node) {
        if (MARKER.test(node.name)) {
          context.report({ messageId: "marker", node });
        }
      },
      Literal(node) {
        // Raw text includes the quotes, which keeps numbers and regexes out of the match.
        if (MARKER.test(node.raw ?? "")) {
          context.report({ messageId: "marker", node });
        }
      },
      "Program:exit"(program) {
        for (const comment of context.sourceCode.getAllComments()) {
          if (MARKER.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: "marker", node: program });
          }
        }
      },
      TemplateElement(node) {
        if (MARKER.test(node.value.raw)) {
          context.report({ messageId: "marker", node });
        }
      },
      // Returning false skips the file.
      before() {
        return TEST_FILE.test(context.filename.replaceAll("\\", "/"));
      },
    };
  },
  meta: {
    docs: {
      description: "Disallow REPRO markers and console.log in test files.",
    },
    messages: {
      console: "Remove `console.log` from the test. Assert the value instead.",
      marker: "Remove the `REPRO` debug marker from the test.",
    },
    type: "problem",
  },
});

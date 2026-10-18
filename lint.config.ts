import { fileURLToPath } from "node:url";
import { antipattern, correctness } from "@effect/tsgo/oxlint-presets";
import solidV2Strict from "eslint-plugin-solid/configs/v2-strict";
import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

// bench/ holds untyped Node scripts that drive staging by hand; they aren't app code.
// tools/oxlint/anti-slop is vendored upstream source (github.com/dmmulroy/anti-slop), except
// tools/oxlint/anti-slop/tranzfer, which is ours.
const generatedIgnores = [
  "**/file-routes.d.ts",
  "docs/design/**",
  "**/styled-system/**",
  "bench/**",
  "tools/oxlint/anti-slop/*.ts",
  "tools/oxlint/anti-slop/{effect,rules,shared,vendor}/**",
];

// Absolute, because apps/web/vite.config.ts loads this file too and a
// relative specifier would resolve against apps/web.
const antiSlopPath = (entry: string) =>
  fileURLToPath(new URL(`./tools/oxlint/anti-slop/${entry}`, import.meta.url));

// The core rules we kept from the old Ultracite preset. Oxlint's default
// correctness rules still run on top of these.
const baseRules: OxlintConfig["rules"] = {
  eqeqeq: "error",
  "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
  "import/no-cycle": "error",
  "import/no-duplicates": "error",
  "no-var": "error",
  "prefer-const": "error",
  "sort-keys": "error",
  "typescript/await-thenable": "error",
  "typescript/ban-ts-comment": "error",
  "typescript/consistent-type-exports": "error",
  "typescript/consistent-type-imports": "error",
  "typescript/no-base-to-string": "error",
  "typescript/no-deprecated": "error",
  "typescript/no-explicit-any": "error",
  "typescript/no-floating-promises": "error",
  "typescript/no-import-type-side-effects": "error",
  "typescript/no-misused-promises": "error",
  "typescript/no-misused-spread": "error",
  "typescript/no-non-null-assertion": "error",
  "typescript/no-unnecessary-type-assertion": "error",
  "typescript/no-unsafe-argument": "error",
  "typescript/no-unsafe-assignment": "error",
  "typescript/no-unsafe-call": "error",
  "typescript/no-unsafe-member-access": "error",
  "typescript/no-unsafe-return": "error",
  "typescript/no-unsafe-type-assertion": "error",
  "typescript/only-throw-error": "error",
  "typescript/restrict-template-expressions": "error",
  "typescript/switch-exhaustiveness-check": "error",
};

// Every rule dmmulroy/anti-slop ships, as its README lists them.
const antiSlopRules: OxlintConfig["rules"] = {
  "anti-slop-effect/no-manual-effect-error-tag": "error",
  "anti-slop-effect/no-manual-tag-comparison": "error",
  "anti-slop-effect/no-manual-tagged-construction": "error",
  "anti-slop-effect/no-service-constructor-imports": "error",
  "anti-slop-effect/prefer-effect-match": "error",
  "anti-slop/no-array-filter-map": "error",
  "anti-slop/no-chained-type-assertions": "error",
  "anti-slop/no-conditional-empty-object-spread": "error",
  "anti-slop/no-known-value-widening": "error",
  "anti-slop/no-module-mocking": "error",
  "anti-slop/no-object-parameters": "error",
  "anti-slop/no-reduce-accumulator-copy": "error",
  "anti-slop/no-reflect-apply": "error",
  "anti-slop/no-reflect-get": "error",
  "anti-slop/no-runtime-typeof": "error",
  "anti-slop/no-shape-in-symbol-names": "error",
  "anti-slop/no-unknown-parameters": "error",
  "anti-slop/no-unknown-returns": "error",
  "anti-slop/no-unknown-type-aliases": "error",
  "anti-slop/no-unsafe-dictionary-type": "error",
  "anti-slop/no-widen-then-assert": "error",
  "anti-slop/require-safety-comment-for-type-assertion": "error",
  "oxc/no-accumulating-spread": "error",
};

// Rules we wrote, in tools/oxlint/anti-slop/tranzfer.
const tranzferRules: OxlintConfig["rules"] = {
  "tranzfer/branded-link-token": "error",
  "tranzfer/branded-user-id": "error",
  "tranzfer/no-debug-markers-in-tests": "error",
  "tranzfer/no-import-then-reexport": "error",
  "tranzfer/no-silent-ignore": "error",
  "tranzfer/schema-type-style": "error",
};

const effectErrorRules = {
  "effecttsgo/floating-effect": "error",
  "effecttsgo/floating-effect-in-vitest": "error",
  "effecttsgo/global-error-in-effect-catch": "error",
  "effecttsgo/missing-effect-context": "error",
  "effecttsgo/missing-effect-error": "error",
  "effecttsgo/missing-layer-context": "error",
  "effecttsgo/missing-star-in-yield-effect-gen": "error",
  "effecttsgo/outdated-api": "error",
  "effecttsgo/return-effect-in-gen": "error",
  "effecttsgo/run-effect-inside-effect": "error",
  "effecttsgo/try-catch-in-effect-gen": "error",
  "effecttsgo/unknown-in-effect-catch": "error",
} as const;

const vitePlusPlugin = {
  name: "vite-plus",
  specifier: "vite-plus/oxlint-plugin",
};

export const lintConfig = (
  paths: {
    api: string[];
    components: string[];
    web: string[];
  },
  opts?: { root?: boolean },
): OxlintConfig => {
  const effectOverride =
    paths.api.length === 0
      ? []
      : [
          {
            files: paths.api,
            rules: {
              ...antipattern.rules,
              ...correctness.rules,
              ...effectErrorRules,
            },
          },
        ];

  const config: OxlintConfig = defineConfig({
    ignorePatterns: generatedIgnores,
    jsPlugins: [
      vitePlusPlugin,
      { name: "anti-slop", specifier: antiSlopPath("index.ts") },
      { name: "anti-slop-effect", specifier: antiSlopPath("effect/index.ts") },
      { name: "tranzfer", specifier: antiSlopPath("tranzfer/index.ts") },
    ],
    overrides: [
      {
        files: paths.web,
        jsPlugins: ["eslint-plugin-solid"],
        rules: {
          ...solidV2Strict.rules,
          "solid/reactivity": "error",
          // String styles carry CSS variables. The object autofix does not
          // type-check against those props.
          "solid/style-prop": "off",
        },
      },
      {
        files: paths.web,
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  message:
                    "The web app has one API client, WebLayer in src/api/client.ts, and it runs in the browser only (docs/SOLID-EFFECT-BINDING.md).",
                  name: "effect/rpc/RpcClient",
                },
              ],
            },
          ],
        },
      },
      {
        // The one place the web app builds its API client.
        files: ["**/src/api/client.ts"],
        rules: { "no-restricted-imports": "off" },
      },
      {
        files: ["**/src/guides/Article.tsx"],
        rules: {
          // Its HTML is our own Markdown from content/, compiled at build time.
          "solid/no-innerhtml": "off",
        },
      },
      {
        files: paths.components,
        rules: {
          "func-style": ["error", "declaration", { allowArrowFunctions: true }],
          "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
        },
      },
      {
        files: ["**/*.{test,spec}.{ts,tsx}"],
        rules: { "vitest/no-focused-tests": "error" },
      },
      {
        // The rule's own fixtures hold the markers it looks for.
        files: ["tools/oxlint/anti-slop/tranzfer/rules/no-debug-markers-in-tests.test.ts"],
        rules: { "tranzfer/no-debug-markers-in-tests": "off" },
      },
      ...effectOverride,
      {
        files: ["apps/api/src/**", "packages/db/src/**"],
        rules: {
          "tranzfer/no-count-subquery-string": "error",
          "tranzfer/no-table-names-in-sql": "error",
          "tranzfer/one-clock-expression": "error",
        },
      },
      {
        // These files are where layers get provided, once per process.
        files: ["apps/api/src/index.ts", "apps/api/scripts/*.ts"],
        rules: { "effecttsgo/strict-effect-provide": "off" },
      },
      {
        // RuntimeContext.phantom is Layer.empty, a type-only stub with no scope to outlive.
        files: [
          "apps/api/src/infrastructure/auth.ts",
          "apps/api/src/infrastructure/email.ts",
          "apps/api/src/infrastructure/r2.ts",
        ],
        rules: { "effecttsgo/strict-effect-provide": "off" },
      },
      {
        // The test builds the Plans layer it exercises and provides it to the one effect under test.
        files: ["apps/api/test/deliveries.test.ts"],
        rules: { "effecttsgo/strict-effect-provide": "off" },
      },
      {
        files: ["packages/db/src/schema.ts"],
        rules: {
          // Column order in drizzle table objects defines DDL column order;
          // keep the better-auth table layout.
          "sort-keys": "off",
        },
      },
    ],
    plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "effecttsgo", "vitest"],
    rules: {
      ...baseRules,
      ...antiSlopRules,
      ...tranzferRules,
      "vite-plus/prefer-vite-plus-imports": "error",
      // The vitest plugin is on for no-focused-tests alone. Its default rules
      // misread @effect/vitest's layer() blocks.
      "vitest/no-standalone-expect": "off",
      "vitest/require-mock-type-parameters": "off",
    },
    settings: solidV2Strict.settings,
  });

  if (opts?.root === true) {
    config.options = { denyWarnings: true, typeAware: true, typeCheck: true };
  }

  return config;
};

export const rootLint = lintConfig(
  {
    api: ["apps/api/**", "apps/web/src/**", "e2e/**", "packages/contracts/**", "packages/db/**"],
    components: ["apps/web/**/*.tsx"],
    web: ["apps/web/**"],
  },
  { root: true },
);

export const webLint = lintConfig({
  api: ["src/**"],
  components: ["**/*.tsx"],
  web: ["**/*.{js,jsx,ts,tsx}"],
});

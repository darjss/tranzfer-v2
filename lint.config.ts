import { antipattern, correctness } from "@effect/tsgo/oxlint-presets";
import solidV2Strict from "eslint-plugin-solid/configs/v2-strict";
import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";

const generatedIgnores = ["**/file-routes.d.ts", "**/solid-env.d.ts", "docs/design/**"];

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
  // Effect contracts declare several Schema.TaggedError / RpcGroup classes per
  // file, and the TaggedError factory call trips the throw-new-error heuristic.
  "max-classes-per-file": "off",
  // Cloudflare.Env is an empty interface designed for declaration merging.
  "typescript/no-empty-interface": "off",
  "typescript/no-empty-object-type": "off",
  "typescript/no-namespace": "off",
  "unicorn/throw-new-error": "off",
} as const;

const vitePlusPlugin = {
  name: "vite-plus",
  specifier: "vite-plus/oxlint-plugin",
};

const oxlintFromEslintLevels = (rules: Record<string, 0 | 1 | 2>) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, level]) => {
      if (level === 2) {
        return [name, "error"];
      }
      if (level === 1) {
        return [name, "warn"];
      }
      return [name, "off"];
    }),
  );

export const lintConfig = (paths: {
  api: string[];
  components: string[];
  web: string[];
}): OxlintConfig => {
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

  return defineConfig({
    extends: [core, antiSlop],
    ignorePatterns: [...(core.ignorePatterns ?? []), ...generatedIgnores],
    jsPlugins: [vitePlusPlugin, ...(antiSlop.jsPlugins ?? [])],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: paths.web,
        jsPlugins: ["eslint-plugin-solid"],
        rules: {
          ...oxlintFromEslintLevels(solidV2Strict.rules),
          "solid/reactivity": "error",
          // String styles carry CSS variables. The object autofix does not
          // type-check against those props.
          "solid/style-prop": "off",
        },
      },
      {
        files: ["**/vite.config.ts"],
        rules: {
          // Vite+ types `lint` against oxlint 1.81. Runtime is 1.82.0 so
          // @effect/tsgo 0.45.0 can patch Oxlint.
          "typescript/no-unsafe-type-assertion": "off",
        },
      },
      {
        files: paths.components,
        rules: {
          "func-style": ["error", "declaration", { allowArrowFunctions: true }],
          "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
        },
      },
      ...effectOverride,
    ],
    plugins: [...(core.plugins ?? []), "effecttsgo"],
    rules: {
      "import/no-namespace": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    settings: solidV2Strict.settings,
  });
};

export const rootLint = lintConfig({
  api: ["apps/api/**", "packages/contracts/**"],
  components: ["apps/web/**/*.tsx"],
  web: ["apps/web/**"],
});

export const webLint = lintConfig({
  api: [],
  components: ["**/*.tsx"],
  web: ["**/*.{js,jsx,ts,tsx}"],
});

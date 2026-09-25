import { antipattern, correctness } from "@effect/tsgo/oxlint-presets";
import solidV2Strict from "eslint-plugin-solid/configs/v2-strict";
import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";

const generatedIgnores = [
  "**/file-routes.d.ts",
  "**/solid-env.d.ts",
  "docs/design/**",
  "**/styled-system/**",
];

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

export const lintConfig = (
  paths: {
    api: string[];
    components: string[];
    effect: string[];
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
    extends: [core, antiSlop],
    ignorePatterns: [...(core.ignorePatterns ?? []), ...generatedIgnores],
    jsPlugins: [vitePlusPlugin, ...(antiSlop.jsPlugins ?? [])],
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
        files: paths.effect,
        rules: {
          // Effect's catch/tapError/flatMap/forEach take callbacks and are neither promises nor arrays; these rules match on names.
          "promise/prefer-await-to-callbacks": "off",
          "promise/prefer-await-to-then": "off",
          "unicorn/no-array-for-each": "off",
          "unicorn/no-array-method-this-argument": "off",
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
      {
        files: ["packages/contracts/src/auth.ts"],
        rules: {
          // The middleware tag and the context key it provides are one seam;
          // Authenticated is meaningless without CurrentPrincipal.
          "max-classes-per-file": "off",
        },
      },
      {
        files: ["packages/contracts/**", "**/*-error.ts", "**/errors/*.ts"],
        rules: {
          // `Schema.TaggedError<E>()(...)` is a class factory, not a thrown
          // error; the rule matches on the callee name alone.
          "unicorn/throw-new-error": "off",
        },
      },
      {
        files: ["packages/db/src/schema.ts"],
        rules: {
          // Column order in drizzle table objects defines DDL column order;
          // keep the better-auth table layout.
          "sort-keys": "off",
        },
      },
      {
        files: ["packages/db/src/client.ts"],
        rules: {
          // Database and Drizzle are one seam — both derive from the same D1
          // handle, so they live in one file.
          "max-classes-per-file": "off",
        },
      },
    ],
    plugins: [...(core.plugins ?? []), "effecttsgo"],
    rules: {
      "import/no-namespace": "off",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    settings: solidV2Strict.settings,
  });
  if (opts?.root === true) {
    config.options = { typeAware: true, typeCheck: true };
  }
  return config;
};

export const rootLint = lintConfig(
  {
    api: ["apps/api/**", "e2e/**", "packages/contracts/**"],
    components: ["apps/web/**/*.tsx"],
    effect: [
      "apps/api/**",
      "e2e/**",
      "packages/**",
      "apps/web/src/api/**",
      "apps/web/src/uploads/**",
    ],
    web: ["apps/web/**"],
  },
  { root: true },
);

export const webLint = lintConfig({
  api: [],
  components: ["**/*.tsx"],
  effect: ["src/api/**", "src/uploads/**"],
  web: ["**/*.{js,jsx,ts,tsx}"],
});

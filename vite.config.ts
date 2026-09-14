import { defineConfig } from "vite-plus";

import { rootLint } from "./lint.config";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/file-routes.d.ts", "**/solid-env.d.ts"],
  },
  // SAFETY: Vite+ types `lint` against oxlint 1.81. Runtime is 1.82.0 so
  // @effect/tsgo 0.45.0 can patch Oxlint and oxlint-tsgolint.
  lint: rootLint as never,
  staged: {
    "*": "vp check --fix",
  },
});

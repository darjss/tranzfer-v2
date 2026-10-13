import { defineConfig } from "vite-plus";

import { rootLint } from "./lint.config";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/file-routes.d.ts",
      "**/styled-system/**",
      "tools/oxlint/anti-slop/*.ts",
      "tools/oxlint/anti-slop/{effect,rules,shared,vendor}/**",
    ],
  },
  lint: rootLint,
  staged: {
    "*": "vp check --fix",
  },
});

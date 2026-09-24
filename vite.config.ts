import { defineConfig } from "vite-plus";

import { rootLint } from "./lint.config";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/file-routes.d.ts", "**/solid-env.d.ts"],
  },
  lint: rootLint,
  staged: {
    "*": "vp check --fix",
  },
});

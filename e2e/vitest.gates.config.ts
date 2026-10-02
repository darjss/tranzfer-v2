import { defineConfig } from "vite-plus";

// Release gates are the multi-hour torture runs; they get their own config so
// `vp run test:e2e` (preview CI) never picks them up.
export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ["gates/**/*.test.ts"],
    testTimeout: 8 * 60 * 60 * 1000,
  },
});

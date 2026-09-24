import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Staging is one shared deployment; files and layer setup run serially.
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ["scenarios/**/*.test.ts"],
    testTimeout: 300_000,
  },
});

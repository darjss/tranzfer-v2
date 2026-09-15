import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileRoutes } from "filesystem-routing/vite";
import { prerender } from "prerender-crawler/vite";
import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { webLint } from "../../lint.config";

const envFlag = (value: string | undefined) => value !== undefined && value !== "";

const workerSsr =
  envFlag(process.env.VITEST) || process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1"
    ? []
    : [
        cloudflare({
          auxiliaryWorkers: [{ configPath: "../api/wrangler.jsonc" }],
          remoteBindings: false,
          viteEnvironment: { name: "ssr" },
        }),
      ];

export default defineConfig({
  build: {
    assetsInlineLimit: 0,
    target: "esnext",
  },
  fmt: {
    ignorePatterns: ["**/file-routes.d.ts", "**/solid-env.d.ts"],
  },
  // SAFETY: Vite+ types `lint` against oxlint 1.81. Runtime is 1.82.0 so
  // @effect/tsgo 0.45.0 can patch Oxlint and oxlint-tsgolint.
  lint: webLint as never,
  plugins: [
    ...workerSsr,
    tailwindcss(),
    solid({
      diagnostics: true,
      extensions: [".jsx", ".tsx"],
      serverFunctions: envFlag(process.env.VITEST)
        ? { configure: "./src/server-config.ts" }
        : { configure: "./src/server-config.ts", devMiddleware: false },
      ssr: true,
      start: true,
    }),
    fileRoutes({ codeSplitting: false, httpMethods: true, types: true }),
    prerender({ crawlLinks: false, emitPages: (p) => p === "/", mode: "hybrid", pages: ["/"] }),
  ],
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          name: "client",
        },
      },
      {
        extends: true,
        test: {
          alias: [
            {
              find: "virtual:env/server",
              replacement: fileURLToPath(new URL("vitest-env-server-stub.ts", import.meta.url)),
            },
          ],
          environment: "node",
          include: ["src/server/**/*.test.ts"],
          name: "server",
        },
      },
    ],
    setupFiles: ["./vitest-setup.ts"],
  },
});

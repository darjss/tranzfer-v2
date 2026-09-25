import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import { prerender } from "prerender-crawler/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { webLint } from "../../lint.config";

const envFlag = (value: string | undefined) => value !== undefined && value !== "";

const workerSsr =
  envFlag(process.env.VITEST) || process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1"
    ? []
    : [cloudflare({ viteEnvironment: { name: "ssr" } })];

export default defineConfig({
  build: {
    assetsInlineLimit: 0,
    target: "esnext",
  },
  environments: {
    // The ssr bundle runs in workerd, where `cloudflare:*` modules are
    // builtins. The client graph reaches the same specifier through binding.ts
    // on a branch `isServer` eliminates, so it must be external there too.
    client: { build: { rolldownOptions: { external: [/^cloudflare:/u] } } },
    ssr: { build: { rolldownOptions: { external: [/^cloudflare:/u] } } },
  },
  fmt: {
    ignorePatterns: ["**/file-routes.d.ts", "**/solid-env.d.ts"],
  },
  lint: webLint,
  plugins: [
    ...workerSsr,
    solid({
      diagnostics: true,
      extensions: [".jsx", ".tsx"],
      ssr: true,
      // Session reads can renew cookies; finish them before committing headers.
      start: { middleware: "./src/middleware.ts", renderMode: "async" },
    }),
    fileRoutes({ codeSplitting: false, httpMethods: true, types: true }),
    Icons({ compiler: "solid" }),
    prerender({ crawlLinks: false, emitPages: (p) => p === "/", mode: "hybrid", pages: ["/"] }),
  ],
  resolve: {
    alias: {
      "styled-system": fileURLToPath(new URL("styled-system", import.meta.url)),
    },
  },
  root: import.meta.dirname,
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

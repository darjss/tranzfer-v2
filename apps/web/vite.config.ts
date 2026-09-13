import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileRoutes } from "filesystem-routing/vite";
import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";

const workerSsr = process.env.VITEST ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  // Turnkey streaming SSR: no index.html and no entry files — the plugin
  // generates the entries around src/App.tsx, wrapped in src/Document.tsx.
  // Production serving is the Worker in src/worker.ts, which calls
  // handleRequest from virtual:solid-ssr-handler. Client assets go to the
  // Workers assets binding; hashed files are resolved through the Solid
  // manifest.
  plugins: [
    ...workerSsr,
    tailwindcss(),
    solid({
      start: {
        middleware: "./src/middleware.ts",
      },
      ssr: true,
      diagnostics: true,
      serverFunctions: {
        configure: "./src/server-config.ts",
        // Let the Cloudflare plugin dispatch /_server in workerd so
        // functions see Worker env/ctx the same as production.
        ...(process.env.VITEST ? {} : { devMiddleware: false }),
      },
      extensions: [".jsx", ".tsx"],
    }),
    fileRoutes({ httpMethods: true, types: true }),
  ],
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  test: {
    globals: false,
    setupFiles: ["./vitest-setup.ts"],
    // Two projects because they need different halves of the framework:
    // component tests run in a DOM against the browser build (the test
    // pipeline's default posture), while server-runtime tests (the session
    // suite) run in node against the real server build.
    projects: [
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          // environment:'node' projects get the server posture from the
          // plugin automatically: server resolve conditions, the framework
          // inlined, and ssr codegen.
          environment: "node",
          include: ["src/server/**/*.test.ts"],
          alias: [
            // Tests run outside the turnkey server: the plugin's env module
            // is stubbed with the same contract (live process.env reads).
            {
              find: "virtual:env/server",
              replacement: fileURLToPath(new URL("./vitest-env-server-stub.ts", import.meta.url)),
            },
          ],
        },
      },
    ],
  },
  build: {
    target: "esnext",
    // Keep images as asset files instead of inlining them into the JS bundle.
    assetsInlineLimit: 0,
  },
});

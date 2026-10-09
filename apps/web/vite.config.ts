import { cloudflare } from "@cloudflare/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import { sitemap } from "prerender-crawler";
import { prerender } from "prerender-crawler/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { webLint } from "../../lint.config";
import { ogImage } from "./og";

const staticPages = [
  "/",
  "/terms",
  "/privacy",
  "/acceptable-use",
  "/pricing",
  "/about",
  "/vs/masv",
  "/vs/wetransfer",
  "/alternatives/wetransfer",
  "/alternatives/masv",
  "/tools/upload-time-calculator",
  "/guides",
  // One per entry in src/guides/guides.ts.
  ...[
    "how-to-send-large-files",
    "send-large-video-files-to-an-editor",
    "send-raw-photos-to-a-client",
    "send-pro-tools-or-logic-session",
    "how-long-to-upload-100-gb",
  ].map((slug) => `/guides/${slug}`),
  // One per entry in src/marketing/content.ts.
  ...["send-large-files", "resume", "folders", "share-links", "dashboard", "privacy"].map(
    (slug) => `/features/${slug}`,
  ),
  ...["videographers", "photographers", "editors", "creators", "studios", "music"].map(
    (slug) => `/for/${slug}`,
  ),
  "/llms.txt",
];

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
    ignorePatterns: ["**/file-routes.d.ts"],
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
    ogImage(),
    // The public pages ship as static HTML; everything else stays live SSR.
    // Flat files (terms.html): Workers static assets serve /terms from them
    // directly, where terms/index.html makes it redirect to /terms/.
    prerender({
      autoSubfolderIndex: false,
      crawlLinks: false,
      emitPages: (p) => staticPages.includes(p),
      integrations: [sitemap({ hostname: "https://tranzfer.app" })],
      mode: "hybrid",
      pages: staticPages,
    }),
  ],
  resolve: {
    alias: {
      "styled-system": `${import.meta.dirname}/styled-system`,
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
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // It imports its own stylesheet, which Node can't load; let Vite handle it.
    server: { deps: { inline: ["@trev.zip/solid-toast"] } },
    setupFiles: ["./vitest-setup.ts"],
  },
});

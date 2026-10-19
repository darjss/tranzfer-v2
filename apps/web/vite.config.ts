import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import { sitemap } from "prerender-crawler";
import { prerender } from "prerender-crawler/vite";
import Icons from "unplugin-icons/vite";
import { imagetools } from "vite-imagetools";
import { defineConfig } from "vite-plus";
import solid from "@solidjs/vite-plugin";
import { webLint } from "../../lint.config";
import { markdown } from "./markdown";
import { ogImage } from "./og";

// One page per Markdown file in content/guides, content/alternatives and content/compare.
const contentPages = (dir: string) =>
  readdirSync(`${import.meta.dirname}/content/${dir}`)
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${dir}/${file.slice(0, -3)}`);

const staticPages = [
  "/",
  "/terms",
  "/privacy",
  "/acceptable-use",
  "/pricing",
  "/about",
  "/vs/masv",
  "/vs/wetransfer",
  "/tools/upload-time-calculator",
  "/guides",
  ...contentPages("guides"),
  ...contentPages("alternatives"),
  ...contentPages("compare"),
  // One per entry in src/marketing/features.ts and audiences.ts.
  ...["send-large-files", "resume", "folders", "share-links", "dashboard", "privacy"].map(
    (slug) => `/features/${slug}`,
  ),
  ...["videographers", "photographers", "editors", "creators", "studios", "music"].map(
    (slug) => `/for/${slug}`,
  ),
  "/llms.txt",
  "/ai",
  "/llms-full.txt",
];

// Sitemap lastmod: when the files that make a page last changed, not when the
// build ran. Shared layout and app code are left out, so an upload fix doesn't
// re-date every page. The production deploy checks out full history.
const lastCommit = (paths: string[]) =>
  execFileSync("git", ["log", "-1", "--format=%cI", "--", ...paths], {
    cwd: import.meta.dirname,
    encoding: "utf-8",
  }).trim();

const billing = "../../packages/contracts/src/billing.ts";
const pageData = new Map([
  ["/", ["src/routes/index.tsx", "src/landing", billing]],
  ["/ai", ["src/routes/ai.tsx", "src/marketing/ai.ts"]],
  ["/guides", ["src/routes/guides/index.tsx", "content"]],
  [
    "/pricing",
    [
      "src/routes/pricing.tsx",
      "src/landing/Pricing.tsx",
      "src/marketing/PriceCalculator.tsx",
      billing,
    ],
  ],
  ["/tools/upload-time-calculator", ["src/routes/tools/upload-time-calculator.tsx", "src/tools"]],
]);

const pageSources = (path: string) => {
  const [section = "", slug] = path.slice(1).split("/");
  if (section === "features") return ["src/marketing/features.ts"];
  if (section === "for") return ["src/marketing/audiences.ts"];
  if (slug !== undefined && ["alternatives", "compare", "guides"].includes(section)) {
    return [`content/${section}/${slug}.md`];
  }
  return pageData.get(path) ?? [`src/routes${path}.tsx`];
};

const lastmod = (path: string) => {
  const date = lastCommit(pageSources(path));
  return date === "" ? {} : { lastmod: date };
};

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
    // The ssr bundle runs in workerd, where `cloudflare:*` modules are builtins.
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
      // One complete document per response: crawlers, no-JS clients and the
      // prerender crawl never see a Loading fallback.
      start: { middleware: "./src/middleware.ts", renderMode: "async" },
    }),
    fileRoutes({ codeSplitting: false, httpMethods: true, types: true }),
    Icons({ compiler: "solid" }),
    imagetools(),
    markdown(),
    ogImage(),
    // The public pages ship as static HTML; everything else stays live SSR.
    // Flat files (terms.html): Workers static assets serve /terms from them
    // directly, where terms/index.html makes it redirect to /terms/.
    prerender({
      autoSubfolderIndex: false,
      crawlLinks: false,
      emitPages: (p) => staticPages.includes(p),
      integrations: [
        sitemap({ entry: (page) => lastmod(page.path), hostname: "https://tranzfer.app" }),
      ],
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
    // Tests cover the open product; infra/alchemy.run.ts sets this per stage.
    env: { VITE_PAID_PLANS_OPEN: "true" },
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // It imports its own stylesheet, which Node can't load; let Vite handle it.
    server: { deps: { inline: ["@trev.zip/solid-toast"] } },
    setupFiles: ["./vitest-setup.ts"],
  },
});

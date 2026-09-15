import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const webRoot = new URL("../apps/web", import.meta.url).pathname;
const apiMain = new URL("../apps/api/src/index.ts", import.meta.url).href;

export default Alchemy.Stack(
  "tranzfer",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* provision() {
    const db = yield* Cloudflare.D1.Database("App");
    const files = yield* Cloudflare.R2.Bucket("Files");

    const api = yield* Cloudflare.Worker("Api", {
      // Newest date the bundled workerd in `alchemy dev` accepts; prod supports it too.
      compatibility: {
        date: "2026-09-08",
        flags: ["nodejs_compat"],
      },
      dev: { port: 8787 },
      env: {
        BUCKET: files,
        DB: db,
      },
      main: apiMain,
      name: "tranzfer-api",
    });

    const web = yield* Cloudflare.Website.Vite("Web", {
      compatibility: {
        date: "2026-09-08",
        flags: ["nodejs_compat"],
      },
      dev: { port: 3000 },
      domain: "tranzfer.app",
      env: {
        API: api,
      },
      name: "tranzfer-web",
      rootDir: webRoot,
    });

    return {
      apiUrl: api.url.as<string>(),
      webUrl: web.url.as<string>(),
    };
  }),
);

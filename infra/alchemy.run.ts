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
  Effect.gen(function* () {
    const db = yield* Cloudflare.D1.Database("App");
    const files = yield* Cloudflare.R2.Bucket("Files");

    const api = yield* Cloudflare.Worker("Api", {
      name: "tranzfer-api",
      main: apiMain,
      compatibility: {
        date: "2026-09-13",
        flags: ["nodejs_compat"],
      },
      env: {
        DB: db,
        BUCKET: files,
      },
    });

    const web = yield* Cloudflare.Website.Vite("Web", {
      name: "tranzfer-web",
      rootDir: webRoot,
      main: "src/worker.ts",
      compatibility: {
        date: "2026-09-13",
        flags: ["nodejs_compat"],
      },
      domain: "tranzfer.app",
      env: {
        API: api,
      },
    });

    return {
      apiUrl: api.url.as<string>(),
      webUrl: web.url.as<string>(),
    };
  }),
);

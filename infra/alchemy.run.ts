import { existsSync } from "node:fs";

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stage } from "alchemy/Stage";
import * as Effect from "effect/Effect";

import ApiWorkerLive, { ApiWorker } from "../apps/api/src/index";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const webRoot = new URL("../apps/web", import.meta.url).pathname;

export default Alchemy.Stack(
  "tranzfer",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* provision() {
    const api = yield* ApiWorker;
    const stage = yield* Stage;
    let domain: string | undefined;
    if (stage === "production") {
      domain = "tranzfer.app";
    } else if (stage === "staging") {
      domain = "staging.tranzfer.app";
    }

    const web = yield* Cloudflare.Website.Vite("Web", {
      compatibility: {
        date: "2026-09-08",
        flags: ["nodejs_compat"],
      },
      dev: { port: 3000 },
      domain,
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
  }).pipe(Effect.provide(ApiWorkerLive)),
);

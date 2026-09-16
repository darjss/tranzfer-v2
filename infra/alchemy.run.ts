import { existsSync } from "node:fs";

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const required = (name: string) => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required; set it in the environment or .env`);
  }
  return Redacted.make(value);
};

const webRoot = new URL("../apps/web", import.meta.url).pathname;
const apiMain = new URL("../apps/api/src/index.ts", import.meta.url).href;

export default Alchemy.Stack(
  "tranzfer",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
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
        R2_ACCESS_KEY_ID: required("R2_ACCESS_KEY_ID"),
        R2_ACCOUNT_ID: required("R2_ACCOUNT_ID"),
        R2_SECRET_ACCESS_KEY: required("R2_SECRET_ACCESS_KEY"),
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

import { existsSync } from "node:fs";

import * as Alchemy from "alchemy";
import * as Axiom from "alchemy/Axiom";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stage } from "alchemy/Stage";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";

import ApiWorkerLive from "../apps/api/src/index";
import { ApiWorker } from "../apps/api/src/worker";
import { isPreviewStage, ownsAxiom, stageName } from "../apps/api/src/infrastructure/stage";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const webRoot = new URL("../apps/web", import.meta.url).pathname;

export default Alchemy.Stack(
  "tranzfer",
  {
    // Axiom credentials resolve when the providers build, so only the stages
    // that own Axiom resources add the provider and need Axiom setup.
    providers: Layer.unwrap(
      stageName.pipe(
        Effect.map((stage) =>
          ownsAxiom(stage)
            ? Layer.mergeAll(Cloudflare.providers(), Axiom.providers())
            : Cloudflare.providers(),
        ),
      ),
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* provision() {
    const api = yield* ApiWorker;
    const stage = yield* Stage;
    const domain = Match.value(stage).pipe(
      Match.when("production", () => "tranzfer.app"),
      Match.when("staging", () => "staging.tranzfer.app"),
      // One level under the zone so Universal SSL covers it.
      Match.when(isPreviewStage, (pr) => `${pr}.tranzfer.app`),
      Match.orElse((): undefined => undefined),
    );

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
      rootDir: webRoot,
    });

    return {
      apiUrl: api.url.as<string>(),
      webUrl: web.url.as<string>(),
    };
  }).pipe(Effect.provide(ApiWorkerLive)),
);

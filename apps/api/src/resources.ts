import * as Alchemy from "alchemy";
import * as Axiom from "alchemy/Axiom";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { Stage } from "alchemy/Stage";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { isPreviewStage, ownsAxiom, stageName } from "./infrastructure/stage";

const DAY_SECONDS = 24 * 60 * 60;

// Stateful resources run live even under `alchemy dev` (Alchemy.remote()).
// Stack state lives in the shared Cloudflare state store, so an emulated
// D1 under one checkout's infra/.alchemy/local drifts from the migrations
// that state records as applied, and fresh worktrees start empty. Browser
// uploads also need presigned S3 URLs, which only real R2 serves.
export const App = Cloudflare.D1.Database("App", {
  // Resolved against process.cwd() by the provider, which is infra/ for
  // dev/plan/deploy.
  migrations: { dir: "../packages/db/migrations", table: "drizzle_migrations" },
}).pipe(Alchemy.remote());

export const Files = Cloudflare.R2.Bucket("Files", {
  cors: [
    {
      allowedHeaders: ["content-type", "if-none-match", "range"],
      allowedMethods: ["GET", "HEAD", "PUT", "POST"],
      // Output.fromEffect so alchemy resolves the origin at plan/deploy; a
      // bare Effect serializes into the CORS payload. orDie fails the plan
      // loudly when APP_URL is unset or malformed.
      allowedOrigins: [
        Output.fromEffect(
          Effect.map(Config.schema(Schema.URLFromString, "APP_URL"), (url) => url.origin).pipe(
            Effect.orDie,
          ),
        ),
      ],
      exposeHeaders: ["etag"],
      maxAgeSeconds: 3600,
    },
  ],
  // Preview stacks are torn down when their PR closes; R2 refuses to delete
  // a bucket that still holds objects.
  forceDestroy: Output.fromEffect(
    Effect.map(Effect.serviceOption(Stage), Option.exists(isPreviewStage)),
  ),
  lifecycleRules: [
    {
      abortMultipartUploadsTransition: { condition: { maxAge: 7 * DAY_SECONDS, type: "Age" } },
      id: "abort-incomplete-multipart",
    },
    {
      // Backstop only. No app-level expiry sweep exists yet (planned in
      // docs/plan/01-foundation.md), so objects can outlive retention until
      // this fires. It must outlive max retention (14 days from finalization)
      // plus open/upload time, so objects under a live link are never deleted
      // early.
      deleteObjectsTransition: { condition: { maxAge: 30 * DAY_SECONDS, type: "Age" } },
      id: "expire-deliveries",
      prefix: "d/",
    },
  ],
}).pipe(Alchemy.remote());

// Axiom names are org-wide, so production and staging each get their own
// dataset and token. Previews reference staging's (see ownsAxiom). Traces only:
// the free plan allows three datasets, and Effect already records every log
// line as an event on its span.
const axiomName = (kind: string) =>
  Output.fromEffect(Effect.map(Stage, (stage) => `tranzfer-${stage}-${kind}`));

const ownedOrStaging = <A, R>(owned: Effect.Effect<A, never, R>, staging: Effect.Effect<A>) =>
  Effect.flatMap(stageName, (stage) => (ownsAxiom(stage) ? owned : staging));

export const Traces = ownedOrStaging(
  Axiom.Dataset("Traces", {
    description: "Tranzfer API and browser upload spans",
    kind: "otel:traces:v1",
    name: axiomName("traces"),
  }),
  Axiom.Dataset.ref("Traces", { stage: "staging" }),
);

// Ingest only: the token reaches the Worker as a secret, and the browser
// relay forwards spans with it, so it must not be able to read anything back.
export const Ingest = ownedOrStaging(
  Effect.gen(function* ingest() {
    const traces = yield* Traces;
    return yield* Axiom.ApiToken("Ingest", {
      datasetCapabilities: traces.name.pipe(
        Output.map((tracesName) => ({ [tracesName]: { ingest: ["create"] } })),
      ),
      name: axiomName("ingest"),
    });
  }),
  Axiom.ApiToken.ref("Ingest", { stage: "staging" }),
);

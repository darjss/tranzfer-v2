import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const DAY_SECONDS = 24 * 60 * 60;

export const App = Cloudflare.D1.Database("App", {
  // Resolved against process.cwd() by the provider, which is infra/ for
  // dev/plan/deploy.
  migrations: { dir: "../packages/db/migrations", table: "drizzle_migrations" },
});

export const Files = Cloudflare.R2.Bucket("Files", {
  cors: [
    {
      allowedHeaders: ["content-type", "range"],
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
  lifecycleRules: [
    {
      abortMultipartUploadsTransition: { condition: { maxAge: 7 * DAY_SECONDS, type: "Age" } },
      id: "abort-incomplete-multipart",
    },
    {
      // Backstop for the 14-day delivery retention the app enforces itself.
      deleteObjectsTransition: { condition: { maxAge: 15 * DAY_SECONDS, type: "Age" } },
      id: "expire-deliveries",
      prefix: "d/",
    },
  ],
});

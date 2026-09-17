import { createEnv } from "@t3-oss/env-core";
import { Schema } from "effect";

// Imported by Node-side entry points (probe-r2.ts, drizzle-kit), which run
// outside the workers-typed tsconfig scope.
declare const process: { env: Record<string, string | undefined> };

const nonEmpty = Schema.toStandardSchemaV1(Schema.NonEmptyString);

// String env for Node-side consumers. In-worker code reads bindings through
// effect-cf's WorkerEnvironment instead: Cloudflare delivers them on the
// per-request env object, not on process.env at module init.
export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    R2_ACCESS_KEY_ID: nonEmpty,
    R2_ACCOUNT_ID: nonEmpty,
    R2_BUCKET: Schema.toStandardSchemaV1(Schema.UndefinedOr(Schema.NonEmptyString)),
    R2_SECRET_ACCESS_KEY: nonEmpty,
  },
});

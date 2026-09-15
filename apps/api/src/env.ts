import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { createEnv } from "@t3-oss/env-core";

// String configuration goes through T3 Env. D1 and R2 stay binding types.
// No string secrets exist for this Worker yet; do not invent placeholders.

export interface ApiEnv {
  BUCKET: R2Bucket;
  DB: D1Database;
}

declare global {
  namespace Cloudflare {
    interface Env extends ApiEnv {}
  }
}

createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: {},
  server: {},
});

export const loadApiEnv = (workerEnv: ApiEnv) => workerEnv;

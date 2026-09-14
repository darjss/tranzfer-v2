import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface ApiEnv {
  BUCKET: R2Bucket;
  DB: D1Database;
}

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export type ApiEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

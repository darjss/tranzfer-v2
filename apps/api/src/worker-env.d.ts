declare namespace Cloudflare {
  interface Env {
    BUCKET: R2Bucket;
    DB: D1Database;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
  }
}

declare namespace Cloudflare {
  interface Env {
    APP_URL: string;
    BETTER_AUTH_SECRET: string;
    BUCKET: R2Bucket;
    DB: D1Database;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
  }
}

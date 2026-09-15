import { createEnv } from "@t3-oss/env-core";

// String configuration goes through T3 Env. D1 and R2 stay binding types on
// Cloudflare.Env (worker-env.d.ts). No string secrets exist yet.
createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: {},
  server: {},
});

import { createEnv } from "@t3-oss/env-core";

// String configuration goes through T3 Env. D1 and R2 stay binding types on
// Cloudflare.Env (worker-env.d.ts); the R2 signing credentials are read via
// effect-cf's WorkerEnvironment where they are used (services/signing.ts).
createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: {},
  server: {},
});

import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";

import { loadApiEnv } from "./env.ts";
import type { ApiEnv } from "./env.ts";

// Bindings are isolate-scoped; the Worker env object is the same on every
// request, so a module binding is enough (no ALS).
let env: ApiEnv;

const app = new Elysia({ adapter: CloudflareAdapter })
  .get("/health", () => ({ ok: true as const }))
  .get("/infra", async () => {
    const d1 = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const key = "infra-probe";
    await env.BUCKET.put(key, "ok");
    const obj = await env.BUCKET.get(key);
    const text = obj === null ? null : await obj.text();
    await env.BUCKET.delete(key);
    return { d1: d1?.ok === 1, r2: text === "ok" };
  })
  .compile();

export default {
  async fetch(request: Request, workerEnv: ApiEnv) {
    env = loadApiEnv(workerEnv);
    return await app.fetch(request);
  },
};

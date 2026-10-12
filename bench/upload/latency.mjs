import { writeFileSync } from "node:fs";
import { base, login, rpc, now, stats, newDelivery, cleanup, GIB } from "./lib.mjs";
import { request } from "./r2.mjs";

const cookie = await login();
const out = { base, startedAt: new Date().toISOString() };
const colos = new Set();

// /health, one keep-alive connection (warm-up call discarded and reported apart).
const health = async () => {
  const t = now();
  const r = await fetch(`${base}/health`);
  await r.text();
  colos.add(r.headers.get("cf-ray")?.split("-")[1]);
  out.serverTiming ??= r.headers.get("server-timing");
  return now() - t;
};
const series = async (name, fn, n = 50) => {
  const warm = await fn();
  const xs = [];
  for (let i = 0; i < n; i++) {
    xs.push(await fn());
  }
  out[name] = { samples: xs, warmupMs: warm, ...stats(xs) };
  console.log(
    name,
    JSON.stringify(Object.fromEntries(Object.entries(out[name]).filter(([k]) => k !== "samples"))),
  );
};
await series("health", health);
await series("me", async () => (await rpc(cookie, "Me")).ms);
await series("deliveries", async () => {
  const r = await rpc(cookie, "Deliveries");
  out.deliveriesRows = r.value.length;
  out.deliveriesServerTiming ??= r.headers.get("server-timing");
  return r.ms;
});

// Part signing against a live multipart upload.
const d = await newDelivery(cookie, 10 * GIB, "bench latency");
try {
  const key = d.transfers[0].objectKey;
  const c = await rpc(cookie, "SignUpload", { key, request: { _tag: "Create" } });
  out.signCreateMs = c.ms;
  const created = await request("POST", c.value.url);
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(created.body.toString())[1];
  out.r2CreateMs = created.totalMs;
  let part = 0;
  await series("signPart", async () => {
    part = (part % 160) + 1;
    return (
      await rpc(cookie, "SignUpload", {
        key,
        request: { _tag: "Part", partNumber: part, uploadId },
      })
    ).ms;
  });
  out.signList = (await rpc(cookie, "SignUpload", { key, request: { _tag: "List", uploadId } })).ms;
} finally {
  await cleanup(cookie, d.id);
}
out.colos = [...colos];
writeFileSync(`${import.meta.dirname}/results/latency.json`, JSON.stringify(out, null, 1));

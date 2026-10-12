// usage: node upload.mjs <concurrency> <sizeGiB> <tag>
// Real flow: CreateDelivery -> sign Create -> POST -> (sign Part -> PUT) x N -> sign Complete -> POST -> FinalizeTransfer.
// Part body: one random 64 MiB buffer reused for every part, in memory only.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { base, login, rpc, now, stats, pct, newDelivery, cleanup, GIB, MIB } from "./lib.mjs";
import { request } from "./r2.mjs";

const concurrency = Number(process.argv[2]);
const sizeGiB = Number(process.argv[3]);
const tag = process.argv[4] ?? `c${concurrency}`;
const PART = 64 * MIB;
const size = sizeGiB * GIB;
const parts = size / PART;
const MAX_ATTEMPTS = 4;

const body = randomBytes(PART);
const cookie = await login();
const run = {
  concurrency,
  errors: [],
  parts,
  retries: 0,
  sizeGiB,
  startedAt: new Date().toISOString(),
  tag,
};
const t0 = now();
const cpu0 = process.cpuUsage();
let delivery;
try {
  let t = now();
  delivery = await newDelivery(cookie, size, `bench ${tag}`);
  run.createDeliveryMs = now() - t;
  const key = delivery.transfers[0].objectKey;
  const transferId = delivery.transfers[0].id;
  run.deliveryId = delivery.id;

  t = now();
  const sc = await rpc(cookie, "SignUpload", { key, request: { _tag: "Create" } });
  run.signCreateMs = sc.ms;
  const created = await request("POST", sc.value.url);
  if (created.status !== 200) {
    throw new Error(`create mpu ${created.status}`);
  }
  run.r2CreateMs = created.totalMs;
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(created.body.toString())[1];
  run.setupMs = now() - t;

  const etags = new Array(parts);
  const rec = [];
  let next = 1;
  let inflight = 0;
  let maxInflight = 0;
  const tData0 = now();
  const worker = async () => {
    while (next <= parts) {
      const partNumber = next++;
      for (let attempt = 1; ; attempt++) {
        const tS = now();
        try {
          const s = await rpc(cookie, "SignUpload", {
            key,
            request: { _tag: "Part", partNumber, uploadId },
          });
          const signMs = now() - tS;
          inflight++;
          maxInflight = Math.max(maxInflight, inflight);
          const tP = now();
          let res;
          try {
            res = await request("PUT", s.value.url, body);
          } finally {
            inflight--;
          }
          if (res.status !== 200) {
            throw new Error(`PUT ${res.status} ${res.body.toString().slice(0, 120)}`);
          }
          etags[partNumber - 1] = res.headers.etag.replaceAll('"', "");
          rec.push({
            attempt,
            endAt: now() - tData0,
            flushMs: res.flushMs,
            httpVersion: res.httpVersion,
            partNumber,
            putMs: res.totalMs,
            reused: res.reused,
            signMs,
            startAt: tS - tData0,
            ttfbMs: res.ttfbMs,
          });
          break;
        } catch (error) {
          run.retries++;
          run.errors.push({
            at: now() - tData0,
            attempt,
            message: String(error.message).slice(0, 200),
            partNumber,
          });
          if (attempt >= MAX_ATTEMPTS) {
            throw error;
          }
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const dataMs = now() - tData0;
  run.dataMs = dataMs;
  run.maxInflight = maxInflight;

  t = now();
  const cs = await rpc(cookie, "SignUpload", { key, request: { _tag: "Complete", uploadId } });
  run.signCompleteMs = cs.ms;
  const xml = `<CompleteMultipartUpload>${etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>"${e}"</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
  const done = await request("POST", cs.value.url, Buffer.from(xml), {
    "content-type": "application/xml",
  });
  if (done.status !== 200 || /<Error>/.test(done.body.toString())) {
    throw new Error(`complete ${done.status} ${done.body.toString().slice(0, 200)}`);
  }
  run.r2CompleteMs = done.totalMs;
  let fin;
  for (let i = 0; ; i++) {
    const tf = now();
    try {
      fin = await rpc(cookie, "FinalizeTransfer", { transferId });
      run.finalizeMs = now() - tf;
      run.finalizeTries = i + 1;
      break;
    } catch (error) {
      if (error.exit?.cause?.[0]?.error?._tag === "NotUploaded" && i < 5) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** i));
        continue;
      }
      throw error;
    }
  }
  run.finalStatus = fin.value.status;
  run.finalState = fin.value.transfers[0].state;
  run.completeToReadyMs = now() - t;
  run.totalMs = now() - t0;

  // Metrics
  const MiB = (ms, n = parts) => (n * 64) / (ms / 1000);
  run.mibpsEndToEnd = MiB(run.totalMs);
  run.mibpsData = MiB(dataMs);
  // Rolling best 60 s window over part completions.
  const ends = rec.map((r) => r.endAt).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; i < ends.length; i++) {
    while (ends[i] - ends[j] > 60_000) {
      j++;
    }
    best = Math.max(best, i - j + 1);
  }
  run.mibpsBest60s = (Math.min(best, ends.length) * 64) / Math.min(60, dataMs / 1000);
  // Steady state: drop first and last `concurrency` completions.
  if (ends.length > concurrency * 3) {
    const a = ends[concurrency];
    const b = ends[ends.length - concurrency - 1];
    run.mibpsSteady = ((ends.length - 2 * concurrency - 1) * 64) / ((b - a) / 1000);
  }
  run.put = stats(rec.map((r) => r.putMs));
  run.ttfb = stats(rec.map((r) => r.ttfbMs));
  run.sign = stats(rec.map((r) => r.signMs));
  run.signShareOfSlotTime =
    rec.reduce((a, r) => a + r.signMs, 0) / rec.reduce((a, r) => a + r.signMs + r.putMs, 0);
  run.perPartMibpsP50 = 64 / (run.put.p50 / 1000);
  run.reusedConnections = rec.filter((r) => r.reused).length;
  run.httpVersions = [...new Set(rec.map((r) => r.httpVersion))];
  run.partsRecorded = rec.length;
  run.rec = rec;
  const cpu = process.cpuUsage(cpu0);
  run.clientCpuPct = ((cpu.user + cpu.system) / 1000 / run.totalMs) * 100;
} catch (error) {
  run.fatal = String(error.stack ?? error).slice(0, 600);
  console.error("FATAL", run.fatal);
} finally {
  if (delivery) {
    const tc = now();
    await cleanup(cookie, delivery.id);
    run.cleanupMs = now() - tc;
  }
  writeFileSync(`${import.meta.dirname}/results/upload-${tag}.json`, JSON.stringify(run));
  const { rec, ...rest } = run;
  console.log(
    JSON.stringify({
      ...rest,
      errors: rest.errors.length,
      put: rest.put && { p50: rest.put.p50, p95: rest.put.p95 },
      sign: rest.sign && { p50: rest.sign.p50, p95: rest.sign.p95 },
      ttfb: undefined,
    }),
  );
}
process.exit(run.fatal ? 1 : 0);

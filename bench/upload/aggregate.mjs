import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const MB = 1e6;
const link = {};
for (const l of readFileSync(`${import.meta.dirname}/link.raw`, "utf-8")
  .trim()
  .split("\n")) {
  const [k, v, wall] = l.split(" ");
  if (k.startsWith("down")) {
    continue;
  }
  (link[k] ??= []).push({ sumBytesPerSec: Number(v), wallSec: wall ? Number(wall) : null });
}
const down = {};
for (const l of readFileSync(`${import.meta.dirname}/down.raw`, "utf-8")
  .trim()
  .split("\n")) {
  const [k, v, wall] = l.split(" ");
  (down[k] ??= []).push({ sumBytesPerSec: Number(v), wallSec: wall ? Number(wall) : null });
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const linkSummary = {};
for (const [k, runs] of Object.entries(link)) {
  const n = k === "single" ? 1 : Number(k.replace("par", ""));
  linkSummary[k] = {
    meanSumMBps: +(mean(runs.map((r) => r.sumBytesPerSec)) / MB).toFixed(1),
    runs: runs.map((r) => +(r.sumBytesPerSec / MB).toFixed(1)),
    streams: n,
    wallAggMBps: runs[0].wallSec ? runs.map((r) => +((n * 100) / r.wallSec).toFixed(1)) : null,
  };
}
const downSummary = {};
for (const [k, runs] of Object.entries(down)) {
  downSummary[k] = {
    note: runs.some((r) => r.sumBytesPerSec < 1000)
      ? "some streams got HTTP 403 (rate limited), sums invalid"
      : "ok",
    runs: runs.map((r) => +(r.sumBytesPerSec / MB).toFixed(1)),
  };
}

const uploads = readdirSync(`${import.meta.dirname}/results`)
  .filter((f) => f.startsWith("upload-"))
  .map((f) => JSON.parse(readFileSync(`${import.meta.dirname}/results/${f}`, "utf-8")));
const byC = {};
for (const u of uploads) {
  (byC[u.concurrency] ??= []).push(u);
}
const uploadSummary = Object.fromEntries(
  Object.entries(byC)
    .sort((a, b) => a[0] - b[0])
    .map(([c, us]) => {
      const all = us.flatMap((u) => u.rec);
      const s = all.map((r) => r.putMs).sort((a, b) => a - b);
      const q = (xs, p) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];
      const sg = all.map((r) => r.signMs).sort((a, b) => a - b);
      return [
        c,
        {
          best60MiBps: us.map((u) => +u.mibpsBest60s.toFixed(1)),
          cleanupMs: +mean(us.map((u) => u.cleanupMs)).toFixed(0),
          clientCpuPct: us.map((u) => +u.clientCpuPct.toFixed(0)),
          dataMiBps: us.map((u) => +u.mibpsData.toFixed(1)),
          e2eMiBps: us.map((u) => +u.mibpsEndToEnd.toFixed(1)),
          errors: us.reduce((a, u) => a + u.errors.length, 0),
          finalizeMs: +mean(us.map((u) => u.finalizeMs)).toFixed(0),
          partPutMsP50: q(s, 50),
          partPutMsP95: q(s, 95),
          partPutMsP99: q(s, 99),
          perStreamMiBpsP50: +(64 / (q(s, 50) / 1000)).toFixed(1),
          r2CompleteMs: +mean(us.map((u) => u.r2CompleteMs)).toFixed(0),
          retries: us.reduce((a, u) => a + u.retries, 0),
          runs: us.length,
          setupMs: +mean(us.map((u) => u.setupMs)).toFixed(0),
          signCompleteMs: +mean(us.map((u) => u.signCompleteMs)).toFixed(0),
          signMsP50: q(sg, 50),
          signMsP95: q(sg, 95),
          signMsP99: q(sg, 99),
          signShareOfSlotTimePct: +(mean(us.map((u) => u.signShareOfSlotTime)) * 100).toFixed(1),
          sizeGiB: us[0].sizeGiB,
          steadyMiBps: us.map((u) => +(u.mibpsSteady ?? 0).toFixed(1)),
          totalSec: us.map((u) => +(u.totalMs / 1000).toFixed(0)),
        },
      ];
    }),
);
const lat = JSON.parse(readFileSync(`${import.meta.dirname}/results/latency.json`, "utf-8"));
const latSummary = Object.fromEntries(
  ["health", "me", "deliveries", "signPart"].map((k) => [
    k,
    Object.fromEntries(
      Object.entries(lat[k])
        .filter(([x]) => x !== "samples")
        .map(([x, v]) => [x, +v.toFixed(1)]),
    ),
  ]),
);
const out = {
  curlHealth: JSON.parse(readFileSync(`${import.meta.dirname}/results/curl_health.json`, "utf-8")),
  download: downSummary,
  latency: latSummary,
  link: linkSummary,
  meta: { colos: lat.colos, deliveriesRows: lat.deliveriesRows, serverTiming: lat.serverTiming },
  upload: uploadSummary,
};
writeFileSync(`${import.meta.dirname}/results/summary.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

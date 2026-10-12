import { readFileSync, writeFileSync } from "node:fs";
import { pct } from "./lib.mjs";

const rows = readFileSync(`${import.meta.dirname}/results/curl_health.tsv`, "utf-8")
  .trim()
  .split("\n")
  .map((l) => l.split("\t").map((x) => Number(x) * 1000));
const col = (i) => rows.map((r) => r[i]);
const names = ["dns", "tcpConnect", "tlsDone", "ttfb", "total"];
const out = {};
names.forEach((n, i) => {
  out[n] = {
    max: Math.max(...col(i)),
    min: Math.min(...col(i)),
    p50: pct(col(i), 50),
    p95: pct(col(i), 95),
    p99: pct(col(i), 99),
  };
});
// Phases: tls handshake = tlsDone - tcpConnect, wait for first byte = ttfb - tlsDone
const diff = (a, b) => rows.map((r) => r[a] - r[b]);
out.tlsHandshake = { p50: pct(diff(2, 1), 50), p95: pct(diff(2, 1), 95) };
out.requestToFirstByte = {
  p50: pct(diff(3, 2), 50),
  p95: pct(diff(3, 2), 95),
  p99: pct(diff(3, 2), 99),
};
out.n = rows.length;
writeFileSync(`${import.meta.dirname}/results/curl_health.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

import { randomUUID } from "node:crypto";

export const base = process.env.BASE ?? "https://staging.tranzfer.app";
if (!base.startsWith("https://staging.tranzfer.app")) {
  throw new Error("staging only");
}
export const MIB = 1024 * 1024;
export const GIB = 1024 * MIB;
export const now = () => performance.now();
export const pct = (xs, p) => {
  if (xs.length === 0) {
    return null;
  }
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
};
export const stats = (xs) => ({
  max: Math.max(...xs),
  mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  min: Math.min(...xs),
  n: xs.length,
  p50: pct(xs, 50),
  p95: pct(xs, 95),
  p99: pct(xs, 99),
});
export const login = async () => {
  const r = await fetch(`${base}/api/auth/staging-login`, {
    body: JSON.stringify({ key: process.env.TEST_LOGIN_KEY }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!r.ok) {
    throw new Error(`login failed ${r.status}`);
  }
  return r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
};
let n = 0;
// Returns { value, ms, status, headers } or throws on RPC failure. Timing covers headers+body.
export const rpc = async (cookie, tag, payload = null) => {
  const t = now();
  const x = await fetch(`${base}/rpc`, {
    body: JSON.stringify({ _tag: "Request", headers: [], id: String(++n), payload, tag }),
    headers: { "content-type": "application/json", cookie },
    method: "POST",
  });
  const text = await x.text();
  const ms = now() - t;
  const { exit } = JSON.parse(text)[0];
  if (exit._tag !== "Success") {
    const err = new Error(`${tag} failed: ${JSON.stringify(exit).slice(0, 300)}`);
    err.exit = exit;
    throw err;
  }
  return { headers: x.headers, ms, status: x.status, value: exit.value };
};
export const newDelivery = async (cookie, size, title) => {
  const id = randomUUID();
  const { value } = await rpc(cookie, "CreateDelivery", {
    files: [
      {
        contentType: "application/octet-stream",
        id: randomUUID(),
        lastModified: Date.now(),
        path: "bench.bin",
        size,
      },
    ],
    id,
    retentionDays: 1,
    title,
  });
  return value;
};
export const cleanup = async (cookie, id) => {
  try {
    await rpc(cookie, "CancelDelivery", { deliveryId: id });
  } catch (error) {
    console.error("cancel failed", id, error.message);
  }
  try {
    await rpc(cookie, "ClearDeliveries", { deliveryIds: [id] });
  } catch (error) {
    console.error("clear failed", id, error.message);
  }
};

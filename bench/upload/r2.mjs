import https from "node:https";
import { now } from "./lib.mjs";

export const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: Infinity,
});
// One request. Resolves with timings; body is a Buffer or undefined.
export const request = async (method, url, body, headers = {}) =>
  await new Promise((resolve, reject) => {
    const u = new URL(url);
    const t0 = now();
    let reused = false;
    let tFinish = 0;
    let tHeaders = 0;
    const req = https.request(
      {
        agent,
        headers: {
          ...headers,
          ...(body ? { "content-length": body.length } : { "content-length": 0 }),
        },
        hostname: u.hostname,
        method,
        path: u.pathname + u.search,
      },
      (res) => {
        tHeaders = now() - t0;
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            flushMs: tFinish,
            headers: res.headers,
            httpVersion: res.httpVersion,
            reused,
            status: res.statusCode,
            totalMs: now() - t0,
            ttfbMs: tHeaders,
          });
        });
        res.on("error", reject);
      },
    );
    req.on("socket", (s) => {
      reused = s.__used === true;
      s.__used = true;
    });
    req.on("finish", () => {
      tFinish = now() - t0;
    });
    req.on("error", reject);
    req.end(body);
  });

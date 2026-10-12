# Upload and API benchmark

Drives the real delivery flow against staging from Node: create a delivery, sign and PUT every 64 MiB part straight to R2, complete, finalize, then cancel and clear it. Part bodies are one random buffer in memory, so nothing large touches disk. `lib.mjs` refuses any base URL other than staging.

Needs `TEST_LOGIN_KEY` from the repo's `.env` (the shell scripts read it themselves).

| Script                                          | What it measures                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `node upload.mjs <parts in flight> <GiB> <tag>` | One upload; per-part timings to `results/upload-<tag>.json`                     |
| `matrix.sh`                                     | 10 GiB at 4, 8, 12 and 16 parts in flight, two interleaved rounds               |
| `node latency.mjs`                              | p50/p95/p99 of `/health`, an auth-only RPC, the deliveries list and a part sign |
| `link.sh`, `down.sh`                            | Raw upload and download speed to speed.cloudflare.com, 1 to 16 streams          |
| `node aggregate.mjs`                            | Folds everything in `results/` into `results/summary.json`                      |

Results from 9 October 2026 (Tokyo, staging): one part stream runs near 18 MiB/s, so throughput scales with parts in flight until about 330 MiB/s at 24. Browsers get 6 connections to R2's HTTP/1.1 endpoint, which is why the web app sends 6 parts at once.

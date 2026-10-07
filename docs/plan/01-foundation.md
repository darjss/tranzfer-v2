# Resume after refresh

Finish the transfer flow. Read [RELIABILITY.md](../RELIABILITY.md) before transfer code. Optional tooling and UI follow-up in [02-pre-upload-readiness.md](02-pre-upload-readiness.md) does not block this milestone.

Remaining work:

- Pass the 350 GB promise gate (`GATE=promise vp run test:gate`). The 10 GB internal and 100 GB beta gates passed on staging; evidence is in #75. Record correctness, avoidable bytes resent and manual intervention the same way.
- Before that run, speed up re-pick verification. `verifyParts` hashes the held parts one at a time, and the time grows with progress (82 s at 25% to 228 s at 70% of 100 GiB, a steady 312 MiB/s; see [BENCHMARKS.md](../BENCHMARKS.md)). At 85% of 350 GiB that is about 16 minutes of a stuck-looking screen.
- Restore persistent `FileSystemFileHandle`s where Chromium supports them, so a refresh needs no reselection.
- Cross-tab ownership (e.g. Web Locks), so a second tab doesn't offer to resume an upload another tab is running.
- Rate-limit the browser trace relay (`/api/telemetry/traces`). It checks origin, content type and size, but a script can still post junk spans. A Cloudflare rate-limit binding would close that.
- Upstream the Uppy `ListParts` pagination fix and drop the patch.

Run existing tests and direct runtime checks. New test files still require explicit approval.

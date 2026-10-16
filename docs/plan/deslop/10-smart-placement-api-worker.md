# Plan 10: Measure Smart Placement on the API Worker (staging)

> **Executor instructions**: The code shipped in PR #174 (`placement: { mode: "smart" }` on `ApiWorker.make` in `apps/api/src/index.ts`). What remains is the staging measurement and the keep-or-revert call. Do not deploy anything yourself; staging deploys from `dev`, production from `main`. No new test files.

## Status

- **Priority**: P2 | **Effort**: S (a measurement, then maybe one line) | **Risk**: LOW (reversible by removing the line; takes up to ~15 min to take effect) | **Depends on**: PR #174 merged to `dev` | **Category**: perf
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

A request goes browser -> web Worker (at the user's edge) -> API Worker by service binding (`apps/web/src/routes/rpc.ts:9`, `env.API.fetch(event.request)`) -> D1 (one primary region, no placement hint at creation, `resources.ts:26`). Most RPCs run several D1 queries one after another: `CreateDelivery` is about 7 reads and a batch write (`deliveries.ts` `replay`, `Plans.current` x2, `admit`, `activeBytes`, `batch`, `view`), `GetBilling` about 5 reads, and every authenticated call starts with Better Auth's session reads. If the API Worker runs at the user's edge and D1's primary is across an ocean, each query pays a round trip. Smart Placement runs the Worker near its backend when Cloudflare measures that to be faster, so the many sequential queries become local and the single extra hop is the web-to-API forward. Cloudflare's docs recommend putting the placement on the back-end Worker of a service-binding pair, which is exactly this shape.

## Behavior to know (Cloudflare docs, https://developers.cloudflare.com/workers/configuration/placement/)

- Only `fetch` handlers are placed. The API Worker's entry is a fetch handler (`index.ts:268`, `return { fetch: handle_ }`); the cron (`index.ts:208`) is unaffected.
- Needs steady traffic from several locations; analysis takes up to ~15 minutes; about 1% of requests skip placement as a baseline. Status values: none/`SUCCESS`/`INSUFFICIENT_INVOCATIONS`/`UNSUPPORTED_APPLICATION` (reverted because it was slower). A `cf-placement` response header shows `remote-XXX` vs `local-XXX` and may be removed before GA.
- It only chooses among locations where the Worker has already run.
- It pulls the Worker toward D1's primary. If you later enable D1 read replication (plan 12), the two pull in opposite directions for reads: a Worker near the primary gains nothing from a replica near the user. Decide with measurements which wins per RPC; do plan 12 only if reads still dominate after this.

## Scope

**In scope**: the `placement` line in `apps/api/src/index.ts` (keep or remove it).
**Out of scope**: the web Worker (`infra/alchemy.run.ts`), D1 location, cron, production until staging data exists.

## Baseline (from PR #174)

Axiom `tranzfer-staging-traces`, `alchemy.stage == "staging"`, 30 days before 2026-10-16, server span duration (named `RpcServer.<Rpc>` then, `<Rpc>` on current `dev`):

| RPC            | n    | p50    | p95    |
| -------------- | ---- | ------ | ------ |
| CreateDelivery | 73   | 201 ms | 331 ms |
| Deliveries     | 69   | 109 ms | 185 ms |
| GetBilling     | 30   | 92 ms  | 207 ms |
| SignUpload     | 2153 | 78 ms  | 175 ms |

`staging.tranzfer.app/health` time to first byte from Tokyo, 60 requests: p50 211 ms, p95 400 ms, min 166 ms.

Previews are no stand-in: each `pr-<n>` stack creates its own D1 wherever the CI runner's API call lands, so preview latencies vary 10x between PRs with identical code, and their only traffic is one CI region plus whoever probes them. PR #174's preview stayed `cf-placement: local-NRT` through 25 minutes of Tokyo-only probing.

## Steps

1. After PR #174 merges and staging redeploys, generate traffic on staging from at least two regions for 20 minutes, then check the placement status in the Cloudflare dashboard (Workers > Api > Settings > Placement) and the `cf-placement` header on `https://staging.tranzfer.app/health`.
2. Re-measure the four spans above for the same window length. Keep the setting only if p50 improves for the multi-query RPCs (`CreateDelivery`, `GetBilling`) and p95 of `SignUpload` does not regress by more than 10%. Otherwise remove the line in a PR against `dev`. Put before/after in that PR or in a comment on #174.
3. Production: the next `dev` to `main` PR carries the line; no extra change.

## Done criteria

- [ ] Before/after table from Axiom on staging recorded in a PR
- [ ] Placement status on staging is `SUCCESS` (or the line was removed and the PR says why)

## STOP conditions

- Placement status is `UNSUPPORTED_APPLICATION` (Cloudflare reverted it as slower): remove the line, record that, and close the plan as rejected.
- Staging traffic is too thin to qualify (`INSUFFICIENT_INVOCATIONS`): report and wait; do not fabricate load from one region.

## Maintenance notes

If the Worker is later split so that the web side calls API methods over RPC entrypoints instead of `fetch`, Smart Placement stops applying (the docs say only fetch handlers are placed). Revisit then.

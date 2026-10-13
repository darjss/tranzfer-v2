# Plan 10: Try Smart Placement on the API Worker (staging first, measured)

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. Infra change: do not deploy anything yourself; open the PR and let CI deploy staging (AGENTS.md: staging deploys from `dev`, previews per PR, production from `main`). No new test files. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/api/src/index.ts apps/api/src/worker.ts apps/api/src/resources.ts infra/alchemy.run.ts`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S (3 lines of code, then a measurement) | **Risk**: LOW (reversible by removing the line; takes up to ~15 min to take effect) | **Depends on**: none | **Category**: perf
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

A request goes browser -> web Worker (at the user's edge) -> API Worker by service binding (`apps/web/src/routes/rpc.ts:9`, `env.API.fetch(event.request)`) -> D1 (one primary region, no placement hint at creation, `resources.ts:20`). Most RPCs run several D1 queries one after another: `CreateDelivery` is about 7 reads and a batch write (`deliveries.ts` `replay`, `Plans.current` x2, `admit`, `activeBytes`, `batch`, `view`), `GetBilling` about 5 reads, and every authenticated call starts with Better Auth's session reads. If the API Worker runs at the user's edge and D1's primary is across an ocean, each query pays a round trip. Smart Placement runs the Worker near its backend when Cloudflare measures that to be faster, so the many sequential queries become local and the single extra hop is the web-to-API forward. Cloudflare's docs recommend putting the placement on the back-end Worker of a service-binding pair, which is exactly this shape.

## What Alchemy 2.0.0-beta.81 supports (checked in `node_modules`)

- `WorkerProps.placement?: WorkerPlacement` (`alchemy/src/Cloudflare/Workers/Worker.ts:719`, type `Exclude<workers.PutScriptRequest["metadata"]["placement"], undefined>` at `:84`). The union (`@distilled.cloud/cloudflare` `workers.ts`, `PutScriptMetadataPlacement`) includes `{ mode: "smart" }` and targeted forms `{ region }`, `{ hostname }`, `{ host }`.
- It is a script-level setting that survives metadata-only edits (`Worker.ts:338,353`; `WorkerProvider.ts:1098,2598,3680`), so changing it does not replace the Worker.
- D1 `primaryLocationHint` exists but "cannot be changed after creation, updating triggers a replacement" (`D1/Database.ts:41-58`). Do not touch it here.

## Behavior to know (Cloudflare docs, https://developers.cloudflare.com/workers/configuration/placement/)

- Only `fetch` handlers are placed. The API Worker's entry is a fetch handler (`index.ts:300`, `return { fetch: handle_ }`); the cron (`index.ts:240`) is unaffected.
- Needs steady traffic from several locations; analysis takes up to ~15 minutes; about 1% of requests skip placement as a baseline. Status values: none/`SUCCESS`/`INSUFFICIENT_INVOCATIONS`/`UNSUPPORTED_APPLICATION` (reverted because it was slower). A `cf-placement` response header shows `remote-XXX` vs `local-XXX` and may be removed before GA.
- It only chooses among locations where the Worker has already run.
- It pulls the Worker toward D1's primary. If you later enable D1 read replication (plan 12), the two pull in opposite directions for reads: a Worker near the primary gains nothing from a replica near the user. Decide with measurements which wins per RPC; do plan 12 only if reads still dominate after this.

## Commands you will need

| Purpose                             | Command       | Expected                           |
| ----------------------------------- | ------------- | ---------------------------------- |
| Check                               | `vp check`    | exit 0                             |
| Plan (dev stage, needs credentials) | `vp run plan` | Worker diff shows only `placement` |

## Scope

**In scope**: `apps/api/src/index.ts` (the props object passed to `ApiWorker.make`, `:43-48`).
**Out of scope**: the web Worker (`infra/alchemy.run.ts`), D1 location, cron, production until staging data exists.

## Steps

1. Baseline (before the PR merges): in Axiom, dataset `tranzfer-staging-traces`, record p50/p95 of the `RpcServer` span duration for `CreateDelivery`, `Deliveries`, `GetBilling` and `SignUpload`, from a client far from D1's region (use the Pro bench in `bench/` or a VPN). Write the numbers in the PR description. If you cannot read Axiom, STOP and ask.
2. Edit the props:
   ```ts
   export default ApiWorker.make(
     {
       compatibility: { date: "2026-09-08" },
       dev: { port: 8787, strictPort: true },
       main: import.meta.url,
       placement: { mode: "smart" },
     },
   ```
   **Verify**: `vp check` exit 0 (the type must accept `{ mode: "smart" }`; if it does not, STOP and report the exact type error).
3. Open the PR. The PR preview stack (`pr-<n>`) gets its own Worker; staging gets it on merge to `dev`. Generate traffic from at least two regions for 20 minutes, then check the placement status in the Cloudflare dashboard (Workers > Api > Settings > Placement) and the `cf-placement` header on a `/health` request via the web domain.
4. Re-measure the same four spans. Keep the setting only if p50 improves for the multi-query RPCs (`CreateDelivery`, `GetBilling`) and p95 of `SignUpload` does not regress by more than 10%. Put before/after in the PR.
5. Production: a second PR from `dev` to `main` carries the same line; no extra change.

## Test plan

No test files; this is measured on staging. Existing `vp run test` is unaffected (local D1 has no placement).

## Done criteria

- [ ] `vp check` exit 0
- [ ] PR description has the before/after table from Axiom
- [ ] Placement status on staging is `SUCCESS` (or the PR explains why it was not kept)

## STOP conditions

- `vp run plan` shows anything besides the placement change on the API Worker (especially a Worker replacement).
- Placement status is `UNSUPPORTED_APPLICATION` (Cloudflare reverted it as slower): record that and close the plan as rejected.
- Staging traffic is too thin to qualify (`INSUFFICIENT_INVOCATIONS`): report and wait; do not fabricate load from one region.

## Maintenance notes

If the Worker is later split so that the web side calls API methods over RPC entrypoints instead of `fetch`, Smart Placement stops applying (the docs say only fetch handlers are placed). Revisit then.

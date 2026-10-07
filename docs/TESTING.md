# Testing

Tranzfer's whole value is surviving failure, so the tests exist to cause failure and watch what the product does about it. A green suite that never cut a network cable proves nothing.

The philosophy comes from the executor reference checkout (`~/dev/tranzfer2-references/apps/executor/e2e`). We took the ideas and left its machinery behind. [RELIABILITY.md](RELIABILITY.md) says what must survive. This file says how we prove it.

New test files still need explicit user approval under [AGENTS.md](../AGENTS.md). This file explains how tests get written once they're approved. It doesn't grant approval.

## Layers

Each layer answers one question. Don't ask a layer a question it can't answer.

| Layer          | Tool                                   | Answers                                                                        |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Types and lint | `vp check`                             | Is this code possible, and does it respect the boundaries?                     |
| Service tests  | `@effect/vitest` through `vp run test` | Do the API services keep their rules on a real local D1, with storage faked?   |
| Staging checks | `vp run test:e2e` (vitest in `e2e/`)   | Does a deployed staging or PR preview build honor the API contract end to end? |
| Scenarios      | Playwright inside `e2e/`               | Does a real user journey survive real failure against the running stack?       |
| Release gates  | `vp run test:gate` torture runs        | Does 10, 100 or 350 GB actually make it? The table in RELIABILITY.md decides   |

## Pure tests

Part-size policy, reconciliation planning, fingerprint versions, state transitions and schema round trips are functions. Hand them values and check the values that come back. "Local says parts 1 to 40 are done and `ListParts` returned these three pages, so upload 38 and 41 onward" is a pure test. It needs no network, no bucket and no mock.

Name tests after the guarantee they protect: `recovery_never_resends_confirmed_parts`, `lost_finalize_response_converges_to_complete`, `process_exit_does_not_abort_remote_upload`. Import from `@effect/vitest`, never `vitest`. Put the test file next to the code it covers.

## Reactivity tests

Solid's dev build reports known anti-patterns as stable diagnostic codes, and `@solidjs/diagnostics` records them together with why each reactive node re-ran. `captureArtifact(() => interaction, { scenario })` runs an interaction against a mounted tree and returns both. Assert on it:

- `expect(artifact).toHaveNoDiagnostics()` fails on any rule code.
- `assertBudget(artifact, { allow: [], maxReruns, maxWastedRuns })` caps how much recomputes. `artifact.attribution.reruns` names each run (`nodeName`), whether its value changed, and the write that caused it. Give the memos you care about a `name` option so they read in the report.
- A run with `changed: false` was wasted. Fix the cause (an unstable memo output, a read that is too wide) instead of raising the budget.

`apps/web/src/dashboard/dashboard.test.tsx` shows both shapes. One progress tick must recompute only the moving row and the grouping check. Cancel must leave Ready before a held server reply, and fail if the optimistic write is removed. Its fake server is `RpcTest.makeClient(Api)` over in-memory handlers, so the page runs its real typed client. Call `flush()` before reading the DOM after a write; Solid updates it asynchronously.

## No R2 fake

We don't build an in-memory R2. R2 has rules a fake would get subtly wrong: uniform part sizes, the 10,000-part cap, incomplete uploads expiring, `ListParts` pagination, the exact ETag it hands back. A fake that gets one of those wrong makes the tests pass and the product lie. Pure logic doesn't need a fake, and wire behavior gets tested against the real thing.

Browsers upload through presigned URLs, and a presigned URL has to point at a real S3 endpoint. So scenarios already talk to real R2. Use small files, like three 5 MiB parts plus a tail, generated deterministically in the run directory. Big files belong to the release gates.

## Staging checks locally

`vp run test:e2e` targets staging by default. Against a running `vp run dev`, point it at your Portless URL and trust the Portless CA:

```text
E2E_BASE_URL=https://tranzfer.localhost NODE_EXTRA_CA_CERTS=~/.portless/ca.pem vp exec varlock run -- vp run test:e2e
```

`varlock run` injects the same `TEST_LOGIN_KEY` that `alchemy dev` loaded. A worktree uses its own host, such as `https://<branch>.tranzfer.localhost`.

## Scenarios

A scenario is one user-meaningful journey, run black box against a live target (staging by default, or a PR preview). It uses the real Workers, real D1 and real R2. `e2e/scenarios/delivery.test.ts` covers the fetch-level checks; `e2e/gates/upload.test.ts` is the release-gate torture run driven through the dashboard UI.

```ts
scenario(
  "Gate · internal survives its faults and delivers one verified file",
  { timeout: Duration.toMillis("8 hours") },
  Effect.gen(function* () {
    const target = yield* Target;
    const browser = yield* Browser;
    const net = yield* NetControl;
    // ...
  }),
);
```

These rules don't bend:

- `scenario()` (`e2e/src/scenario.ts`) is the only way to write one. Its body is an Effect, and the services it yields are its declaration of what it needs.
- Sign in through `Target`'s `loginKey` and `POST /api/auth/staging-login`; never log the key or cookies.
- Assert only through the typed RPC client, the browser, or the ledger. Never import app internals. Never poke D1 to make a test pass.
- Drive the UI like a user: role and text locators, real file choosers. No implementation details.
- Clean up with `Effect.ensuring`, so a failure halfway through doesn't leak uploads. Where possible, clean up through the product's own cancel and delete paths.
- No sleeps. Wait for a network event, a navigation or a visible state. The one exception is a fault's own duration, which is the thing under test.
- Assert values, not booleans. `expect(partCount(842)).toBe(1)` explains the failure. `expect(ok).toBe(true)` explains nothing.
- Names read as product guarantees.
- A failing assertion means the product or the scenario is wrong. Fix one of them. Never weaken, skip or retry-loop an assertion into green. A flaky scenario is a bug.

Each run writes `e2e/runs/<slug>-<timestamp>/` with `result.json` (timeline, recorded measurements, manual interventions, environment), `ledger.jsonl`, numbered step screenshots and `failure.png` on failure. Git ignores it. No Playwright trace or video: gates run for hours and the archives would bloat.

### Release gates

`e2e/gates/gates.ts` holds the fault plans — `internal`, `beta`, `promise` — matching the table in RELIABILITY.md, with `at` as the fraction of parts acked when the fault lands. Every gate also loses the Complete response: the trap lets the request reach R2, aborts the response, then checks the product converges without a second multipart upload. The `beta` sleep outlasts the 15-minute upload-URL TTL, which is the authorization-expiry row.

```text
GATE=internal vp exec varlock run -- vp run test:gate
```

Requirements: `uv`, FUSE3 and `/dev/fuse`, and Chromium via `playwright` (installed as an e2e devDependency). `GATE_SIZE` overrides the size for rehearsals — bytes or `NGiB` — and `result.json` records `sizeOverridden: true`, so a rehearsal can't pass for a gate. `GATE_KEEP=1` leaves the delivery for inspection; browser and mounts still come down.

The uploaded file is a FUSE computation (`e2e/tools/synthfile.py` run through `uv run --script`): AES-256-CTR keystream over zeros, keyed by a random seed, so every byte is generated on read and nothing needs disk. `--flip` XORs one byte, producing a file with identical name, size and mtime but different content — the impostor check. `e2e/src/synthfile.ts` mounts it scoped and hashes it streamed.

The gate must end with one upload id, one acknowledged create, zero avoidable resends, zero missing parts, and a downloaded SHA-256 equal to the source hash read through the mount.

## Services

| Service      | Gives a scenario                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Target`     | Base URL, `loginKey`, and `api`/`anon` typed RPC clients (signed-in and anonymous)                                                                                                                                                                                                  |
| `Browser`    | Chromium spawned detached on a persistent profile, so IndexedDB survives `crash()` and relaunch. `freeze()` SIGSTOPs the whole group                                                                                                                                                |
| `NetControl` | `offline`, one-shot part failure, and the lost-Complete trap, each through its own CDP Fetch pattern (never `route()`, which stalls part uploads and the ledger's events). Each trap returns a Deferred that records its own firing; a planned trap that never fires fails the gate |
| `Ledger`     | The parts ledger: every R2 request recorded pending, settled on response, stalled-out after 10 minutes without a new acknowledged part                                                                                                                                              |
| `Run`        | The run directory, named steps with screenshots, manual-intervention reasons, and `record()` into `result.json`                                                                                                                                                                     |

The parts ledger is the most important thing in the harness. Part bytes go straight from the browser to R2, so the API never sees them. The browser's own network events record every request to the R2 host; "acked" means the browser saw the 200. That's how a gate proves part 842 went over the wire exactly once, and why a resent part an ack was never seen for doesn't count as avoidable. It turns "avoidable bytes resent" from a metric into an assertion.

## Identity

Sign-in is Google only, and scenarios don't go through Google. Outside production, when `TEST_LOGIN_KEY` is set, the API registers `POST /api/auth/staging-login` (`apps/api/src/infrastructure/staging-login.ts`). It checks the key, then creates the staging user and a real session. Every request after that goes through real session validation. Production never registers the route.

One scenario checks that sign-in redirects to Google with the right callback URL. The real OAuth round trip gets checked by hand against the deployment.

## Why Playwright directly

Vitest browser mode runs test code inside an iframe next to a rendered component. It's a component testing tool. It can't toggle offline mid-scenario, intercept routes on the fly, relaunch a persistent profile, or drive a separately served app without fighting its own orchestrator page. Those four things are the whole harness. If Solid component tests ever outgrow jsdom and `@solidjs/testing-library`, browser mode is where they go next. It's not where e2e goes.

## CI

`vp check` and `vp run test` gate every PR. The API service tests in `apps/api/test` run on wrangler's local D1 (`@tranzfer/db/testing`) with an in-memory `Storage`; use `TestClock` for anything time-based. Scenarios stay out of the PR gate until they prove fast and stable against the local stack. Then they get their own workflow.

PR previews (`.github/workflows/preview.yml`) run the PR branch's own deploy code with the `staging` environment's Cloudflare token and `TEST_LOGIN_KEY`. Fork PRs are skipped, so this is safe while everyone with write access is trusted. Before adding outside collaborators, require approval on the `staging` environment or give previews a token scoped to `pr-*` resources.

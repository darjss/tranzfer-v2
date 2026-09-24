# Testing

Tranzfer's whole value is surviving failure, so the tests exist to cause failure and watch what the product does about it. A green suite that never cut a network cable proves nothing.

The philosophy comes from the executor reference checkout (`~/dev/tranzfer2-references/apps/executor/e2e`). We took the ideas and left its machinery behind. [RELIABILITY.md](RELIABILITY.md) says what must survive. This file says how we prove it.

New test files still need explicit user approval under [AGENTS.md](../AGENTS.md). This file explains how tests get written once they're approved. It doesn't grant approval.

## Layers

Each layer answers one question. Don't ask a layer a question it can't answer.

| Layer          | Tool                                   | Answers                                                                      |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Types and lint | `vp check`                             | Is this code possible, and does it respect the boundaries?                   |
| Pure tests     | `@effect/vitest` through `vp run test` | Is the transfer logic right when you hand it plain values?                   |
| Staging checks | `pnpm test:e2e` (vitest in `e2e/`)     | Does the deployed staging build honor the API contract end to end?           |
| Scenarios      | Playwright inside `e2e/`               | Does a real user journey survive real failure against the running stack?     |
| Release gates  | People, real files, real networks      | Does 10, 100 or 350 GB actually make it? The table in RELIABILITY.md decides |

## Pure tests

Part-size policy, reconciliation planning, fingerprint versions, state transitions and schema round trips are functions. Hand them values and check the values that come back. "Local says parts 1 to 40 are done and `ListParts` returned these three pages, so upload 38 and 41 onward" is a pure test. It needs no network, no bucket and no mock.

Name tests after the guarantee they protect: `recovery_never_resends_confirmed_parts`, `lost_finalize_response_converges_to_complete`, `process_exit_does_not_abort_remote_upload`. Import from `@effect/vitest`, never `vitest`. Put the test file next to the code it covers.

## No R2 fake

We don't build an in-memory R2. R2 has rules a fake would get subtly wrong: uniform part sizes, the 10,000-part cap, incomplete uploads expiring, `ListParts` pagination, the exact ETag it hands back. A fake that gets one of those wrong makes the tests pass and the product lie. Pure logic doesn't need a fake, and wire behavior gets tested against the real thing.

Browsers upload through presigned URLs, and a presigned URL has to point at a real S3 endpoint. So scenarios already talk to real R2. Use small files, like three 5 MiB parts plus a tail, generated deterministically in the run directory. Big files belong to the release gates.

## Scenarios

A scenario is one user-meaningful journey, run black box against the local stack at `https://tranzfer.localhost`. It uses the real Workers, local D1 and real R2.

```ts
scenario(
  "Recovery · a refresh mid-upload resumes without resending confirmed parts",
  { timeout: 180_000 },
  Effect.gen(function* () {
    const target = yield* Target;
    const browser = yield* Browser;
    const net = yield* NetControl;
    const storage = yield* Storage;
    // ...
  }),
);
```

These rules don't bend:

- `scenario()` is the only way to write one. Its body is an Effect, and the services it yields are its declaration of what it needs. There's no separate capability list.
- Every scenario gets a fresh identity from `target.newIdentity()`. Isolation comes from new users, never from resetting shared state.
- Assert only through the typed RPC client, the browser, or storage the app really uses. Never import app internals. Never poke D1 to make a test pass.
- Clean up with `Effect.ensuring`, so a failure halfway through doesn't leak uploads. Where possible, clean up through the product's own cancel and delete paths.
- No sleeps. Wait for a network event, a navigation or a visible state.
- Assert values, not booleans. `expect(partCount(842)).toBe(1)` explains the failure. `expect(ok).toBe(true)` explains nothing.
- Names read as product guarantees: "Recovery · a lost finalize response still converges to complete".
- A failing assertion means the product or the scenario is wrong. Fix one of them. Never weaken, skip or retry-loop an assertion into green. A flaky scenario is a bug.

Each run writes `e2e/runs/<slug>/` with `result.json`, a Playwright trace, video and `failure.png`. Git ignores it. When you hand off work that changes user-visible behavior, include the run directory and what to look at.

## Services

| Service                     | Gives a scenario                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Target`                    | Base URL and `newIdentity()`                                                                                           |
| `Api`                       | The typed Effect RPC client from `packages/contracts`, signed in as an identity                                        |
| `Browser`                   | Playwright sessions with trace, video and step screenshots                                                             |
| `Browser.persistentSession` | A persistent profile, so IndexedDB survives closing and relaunching the browser. This is how levels 3 and 4 get tested |
| `NetControl`                | Offline and online, plus failing, delaying or erroring chosen signing and part requests                                |
| `Storage`                   | `ListParts` and `HeadObject` against the bucket the app signs for, plus the parts ledger                               |

The parts ledger is the most important thing in the harness. Part bytes go straight from the browser to R2, so the API never sees them. The browser surface records every page request to the R2 host as `partNumber -> count`. That's how a scenario proves part 842 went over the wire exactly once. It turns "avoidable bytes resent" from a metric into an assertion.

## Identity

Sign-in is Google only, and scenarios don't go through Google. Outside production, the API exposes a dev-only identity route that uses Better Auth's `testUtils` plugin to create a user and a real session. Every request after that goes through real session validation. Production never registers the route.

One scenario checks that sign-in redirects to Google with the right callback URL. The real OAuth round trip gets checked by hand against the deployment.

## Why Playwright directly

Vitest browser mode runs test code inside an iframe next to a rendered component. It's a component testing tool. It can't toggle offline mid-scenario, intercept routes on the fly, relaunch a persistent profile, or drive a separately served app without fighting its own orchestrator page. Those four things are the whole harness. If Solid component tests ever outgrow jsdom and `@solidjs/testing-library`, browser mode is where they go next. It's not where e2e goes.

## CI

`vp check` gates every PR. `vp run test` joins the gate once test files exist, because an empty run isn't coverage. Scenarios stay out of the PR gate until they prove fast and stable against the local stack. Then they get their own workflow.

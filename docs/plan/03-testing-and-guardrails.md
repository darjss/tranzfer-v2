# Testing strategy and agent guardrails

Status: proposed. This document authorizes no implementation by itself beyond
the step being executed.

Two related pieces of work, one principle:

> Docs tell agents what good architecture looks like. Types say what is
> possible. Lint stops architectural drift. Contract checks stop semantic
> drift. Torture tests decide whether Tranzfer works.

The reference is the executor checkout (`~/dev/tranzfer2-references/apps/executor`,
audit at `audits/executor.md`). Its e2e suite is worth stealing structurally;
roughly 80% of that package is executor-specific machinery (multi-target
matrix, run viewer, film/desk/chat-theater, VM drivers, MCP surfaces, motel
telemetry). Do not port the machinery. Port the ideas.

## What the executor e2e setup actually is

- `e2e/` is its own workspace package running vitest + `@effect/vitest`.
- `scenario(name, options, Effect.gen(...))` is the only way a test is written
  (`e2e/src/scenario.ts`). The body is an Effect. Its requirements are the
  capability declaration: it yields services from `src/services.ts`, and
  yielding a service the current target cannot provide becomes a recorded
  skip, not a failure.
- A `Target` (`e2e/src/target.ts`) is one deployed shape of the product seen
  from the outside: base URL, capability set, and `newIdentity()`. Isolation
  comes from minting a fresh user per scenario, never from resetting state.
- Vitest projects map directories to targets. Each project's `globalSetup`
  boots that app's own dev server, or attaches via `E2E_<TARGET>_URL`.
- Every run gets `runs/<target>/<slug>/` with `result.json`, the extracted
  test source, and browser artifacts (Playwright trace, video, per-step
  screenshots, `failure.png`). The test source is the review artifact.
- Scenarios are black-box: typed API client, browser, CLI, emulators. Never
  import app internals, never poke the DB.
- `Effect.ensuring` owns cleanup so mid-test failures do not leak state.

What to leave behind: the viewer SPA, film/desk/chat-theater recording tiers,
VM guest drivers, emulator fleet, telemetry store, the port-block allocator
(Portless already gives stable names), and most of the multi-target matrix.
Tranzfer has one target today.

## 1. Write docs/TESTING.md

A rules document in the style of STACK.md and RELIABILITY.md. It states the
testing contract; mechanics live in `e2e/RUNNING.md` once the harness exists.
Contents:

- The layers, and what each one decides:
  - **Unit/invariant tests** (`@effect/vitest`, `vp test`): pure transfer
    logic, state machines, reconciliation, fingerprinting, schema round-trips.
    RELIABILITY.md invariants become named tests
    (`recovery_never_resends_confirmed_parts`,
    `lost_finalize_response_converges_to_complete`,
    `process_exit_does_not_abort_remote_upload`).
  - **E2E scenarios** (`e2e/` package): one user-meaningful journey each,
    black-box against the running stack, written once via `scenario()`.
  - **Torture gates** (RELIABILITY §34): the 10/100/350 GB runs stay staged,
    human-triggered releases gates. The suite proves the mechanics at small
    sizes; it does not pretend a simulated R2 proves 350 GB behavior.
- The black-box rule. Assert through the typed RPC client, the browser, or a
  dev-gated inspection surface. Never import app internals.
- Isolation by fresh identity, not resets.
- The quality bar: scenario names read as product guarantees ("Recovery · a
  lost finalize response still converges to complete"), assertions are plain
  `expect` with intent messages, no sleeps, values not booleans.
- Failure injection is a first-class surface, not a hack: network cuts,
  throttling, and forced 4xx/5xx on signing and part requests are how the
  RELIABILITY §31 matrix becomes executable.
- Remote truth is asserted, not assumed: scenarios verify R2-side state
  (parts present, object completed) through a dev inspection surface, and
  verify no confirmed part was re-sent through the request ledger.
- What does not exist yet and must not be pretended at: desktop targets,
  real-size gates in CI, a run viewer.

## 2. Size and complexity guardrails (lint, existing stack)

Extend `lint.config.ts`. All of these are native oxlint rules, no new
dependencies:

- `max-lines`: error at 700 per source file.
- `max-lines-per-function`: error at 150.
- `complexity`: error at 15.
- `max-depth`: error at 4.
- Exempt generated files (already ignored), `drizzle` migration output, and
  `e2e/**` scenario files (a scenario is a spec; forced fragmentation makes it
  worse).

The warn tier (400 lines per file, 80 per function) is not a lint rule. It
lives in the context-budget report in step 6, because a warning nobody reads
is worse than no warning. The hard ceilings exist to stop 600-line god files,
not to reward splitting a cohesive 450-line state machine into confetti.
Optimize for bounded coherent context, not lowest LOC.

## 3. Architectural boundary rules (lint, `no-restricted-imports`)

Machine-enforce the boundaries STACK.md already declares, via per-path
overrides in `lint.config.ts`:

- `packages/contracts/**`: forbid `solid-js`, `drizzle-orm`, `cloudflare:*`,
  `better-auth`, `@polar-sh/*`, and any `apps/*` path.
- `packages/upload-core/**` (when it exists): forbid `solid-js`, `@uppy/*`,
  `drizzle-orm`, `cloudflare:*`. The transfer model must not know the
  transport or the UI.
- `apps/api/**`: forbid `solid-js`, `@uppy/*`, and `apps/web` paths.
- `apps/web/**`: forbid `drizzle-orm`, `better-auth` server modules, and
  `apps/api` paths. Scope carefully: `src/middleware.ts` and `src/routes/*`
  legitimately lazy-import `cloudflare:workers`.
- `import/no-cycle`: error, repo-wide.

An agent that "fixes" something by reaching across the architecture with one
convenient import now fails `vp check` instead of passing review.

## 4. `tranzfer` oxlint plugin (Effect forbidden patterns)

Copy executor's mechanism, not its rules: one
`scripts/oxlint-plugin-tranzfer.js` registered under `jsPlugins` in
`lint.config.ts`, each rule a small `create(context)` visitor (reference:
`scripts/oxlint-plugin-executor/rules/no-effect-escape-hatch.js`, ~30 lines).

Initial rules, each scoped to the paths where they apply:

- `tranzfer/no-effect-run-outside-entry`: `Effect.runSync` / `runPromise` /
  `runFork` / `runPromiseExit` call sites are entry-point machinery. Allowed
  in `apps/api/src/index.ts`, the web Worker's server edges, `infra/`, `e2e/`,
  and test files. Everywhere else they hide the runtime boundary.
- `tranzfer/no-atom-import`: belt-and-suspenders beside
  `no-restricted-imports` on `@effect/atom` and `effect-atom`. STACK.md says
  Solid owns UI state.
- `tranzfer/no-vitest-import`: tests import from `@effect/vitest`, not
  `vitest` directly (executor's rule, applies unchanged once tests exist).

Deliberately not rules yet: "finalizer must not abort remote uploads" and
"fiber lifetime is not transfer lifetime" are semantic and stay as AGENTS.md
and review-checklist rules. Add lint rules only where an AST pattern is
unambiguous.

## 5. Public contract snapshot

`scripts/check-public-api.ts` (run by `vp check` or a CI step): extract the
exported symbol names from `packages/contracts` and diff against a committed
`snapshot` file. Removals and renames fail; additions are allowed (regen via
`--update`). Hermes lost externally-consumed names to "unused internal"
cleanups; the RPC operation names and error schemas in contracts are exactly
that class of surface. ~100 lines, uses the TypeScript compiler API already
in the repo.

Extend the same check to serialized durable-session schemas once
`upload-core` exists: the IndexedDB session record's field names are a
contract with a future version of the app.

## 6. Context-budget report

`scripts/context-budget.ts`, printed in CI as an informational artifact, not
a gate:

```text
largest source files (warn threshold 400)
largest functions (warn threshold 80)
highest fan-out modules
circular dependencies (import/no-cycle output)
public API additions/removals
```

The point is noticing `recovery.ts` drifting from 320 to 1,480 lines across
thirty agent PRs before it becomes the thing nobody can load into context.
Keep it under ~150 lines of script. No database, no trend tracking, no
ratchet on day one.

## 7. AGENTS.md additions

Two short rules, matching the executor/Hermes procedures:

- Baseline against main: when a check fails, reproduce it on unchanged
  `origin/main` before attributing it to the current diff. Stops agents from
  burning time fixing pre-existing warnings.
- Placement: where new behavior belongs. Transfer identity/reconciliation to
  `upload-core` and application services; browser multipart mechanics to the
  Uppy adapter; durable browser state to the IndexedDB adapter; remote truth
  to the storage service; rendering to Solid; process-local orchestration to
  Effect. Component lifetime and fiber lifetime are not transfer lifetime.

## 8. The e2e harness (`e2e/` package)

Sequenced after the first real product flow exists (plan 02 deferred browser
smoke for the same reason). When it lands:

- Add `e2e` to `pnpm-workspace.yaml` packages. Dependencies: `vitest` (via
  `vp test`), `@effect/vitest` at the repo's Effect RC, `playwright`,
  `effect`, `@tranzfer/contracts`.
- Drive browsers with raw `playwright`, not Vitest 4 browser mode. Browser
  mode runs test code inside an iframe against a rendered component; it is a
  component-testing tool. It cannot toggle `context.setOffline` mid-scenario,
  intercept routes on the fly, relaunch a persistent profile, or navigate a
  separately served app without fighting the orchestrator page (the provider
  exposes the real `BrowserContext` only through the server-side Commands
  API). Those four things are the harness. Vite+ also keeps the Playwright
  provider opt-in (`vite-plus/test/browser-playwright` plus a manual
  `playwright` install). If component tests ever outgrow jsdom +
  `@solidjs/testing-library`, browser mode is the upgrade path for them, not
  for e2e.
- Port `scenario.ts` almost verbatim, minus the viewer manifest, film
  splicing, and test-source extraction (keep `result.json` and per-run
  artifact dirs; add `test.ts` extraction only if reviewers miss it).
- `src/services.ts`, tranzfer edition:
  - `Target` — the running stack. One target initially (`local`, booted via
    `alchemy dev` or attached with `E2E_URL`). Design the interface so a
    `pr-N` stage target drops in later.
  - `Api` — the typed Effect RPC client derived from `packages/contracts`.
  - `Browser` — Playwright sessions with trace, video, per-step screenshots,
    `failure.png` (port `surfaces/browser.ts`, minus telemetry/motel and the
    React hydration probe; Solid marks hydration differently).
  - `Browser.persistentSession` — `chromium.launchPersistentContext` with a
    run-dir profile, because IndexedDB is what makes tab-close and
    browser-restart recovery scenarios real. This is the difference between
    testing refresh and testing RELIABILITY level 3/4.
  - `NetControl` — fault injection: `context.setOffline`, route interception
    that fails, delays, or 4xx/5xx's signing and part requests. The §31
    matrix lives here.
  - `StorageTruth` — assert remote state (parts present, object exists,
    final size) through a dev-gated API surface, never by reaching into
    workerd's storage. Plus the control-plane ledger: in dev the API records
    sign/uploadPart/complete/abort calls per transfer, so a scenario can
    assert confirmed parts were never re-sent. This is the tranzfer
    equivalent of executor's emulator request ledgers.
  - `Restart` — later. Restarting `alchemy dev` preserves the sim's D1/R2 on
    disk, which is exactly the "server dies, durable state survives" case,
    but it is not needed for the first suite.
- Identity: `target.newIdentity()` mints a Better Auth session through a
  dev-gated path. Decide between a test-only RPC and a seeded session when
  auth lands; do not build a parallel fixture identity that bypasses real
  auth.
- `e2e/AGENTS.md` (always-on invariants, ~40 lines, adapted from executor's)
  and `e2e/RUNNING.md` (mechanics).
- CI: e2e stays out of the PR `vp check` gate initially. Add a separate
  workflow once the suite proves fast and non-flaky against the local stack.

## 9. Invariant tests and the multipart fake

Unit-level, but the piece that makes RELIABILITY executable before a browser
ever opens:

- An in-memory S3-wire fake implementing multipart create, UploadPart,
  ListParts, CompleteMultipartUpload, and Abort, with programmable failures
  (drop request N, return 500 then succeed, lose the Complete response). It
  keeps a request ledger. This is the only "emulator" tranzfer needs; build
  it as a test adapter against the Distilled S3 interface, not a second
  product surface.
- Named invariant tests over `upload-core`'s reconciliation and state
  machines against that fake. The scenario names come straight from
  RELIABILITY §4 and §31.

New test files require explicit approval under AGENTS.md; steps 8 and 9 are
that request.

## Sequencing

1. Steps 1–7 are doc-and-lint work, landable now: TESTING.md, lint rules,
   the tranzfer plugin skeleton, contract snapshot, budget script, AGENTS.md
   additions.
2. Steps 8–9 land with the first transfer flow, when there is a product
   surface worth driving.
3. Torture gates remain RELIABILITY §34 staged runs; the harness makes the
   small-size versions executable first.

Each step completes when `vp check`, `vp run test`, and the relevant build
pass, and the new check demonstrably fails on a planted violation.

# Testing and guardrails

The rules are in [TESTING.md](../TESTING.md). This file only lists work still to do. The lint items can land now. The harness lands with the first transfer flow in [01-foundation.md](01-foundation.md).

## Lint, landable now

All native oxlint rules in `lint.config.ts`. No custom plugin.

- Ceilings: `max-lines` 700, `max-lines-per-function` 150 (skip blank lines and comments), `complexity` 15, `max-depth` 4, `import/no-cycle`. I measured on 2026-09-24 and the only violation at these limits is `Landing` in `apps/web/src/landing/Landing.tsx`, at 331 lines. Split it into its page sections in the same PR. Exempt migrations and `e2e/scenarios/**` from the function limit.
- Boundaries with per-path `no-restricted-imports`:
  - `packages/contracts`: no `solid-js`, `drizzle-orm`, `cloudflare:*`, `better-auth`, `@polar-sh/*` or app paths.
  - `packages/upload-core`, once it exists: no `solid-js`, `@uppy/*`, `drizzle-orm` or `cloudflare:*`.
  - `packages/db`: no `solid-js`, `@uppy/*` or app paths.
  - `apps/api`: no `solid-js`, `@uppy/*` or `apps/web` paths.
  - `apps/web`: no `drizzle-orm`, `@tranzfer/db`, `better-auth` server modules or `apps/api` paths.
  - Test files: no `vitest`. Use `@effect/vitest`.
- Runtime boundary with `no-restricted-properties`: ban `Effect.runSync`, `runPromise`, `runFork`, `runPromiseExit` and `ManagedRuntime.make`. Allow them in `apps/web/src/api/**`, `apps/api/probe-r2.ts`, `infra/**`, `e2e/**` and test files. Those are today's only call sites.
- Prove each rule with a planted violation that fails `vp check`, then remove the plant.

## Contract snapshot

- Add a script that emits declarations for `packages/contracts` and diffs them against a committed snapshot. RPC tag names and struct fields survive as literal types, so renaming `Health` or dropping a field fails. Additions pass and get recorded with `--update`. Run it in the `verify` workflow.
- When `upload-core` exists, add the IndexedDB recovery record schema to the snapshot. Future versions of the app have to read it.

## Harness, with the first transfer flow

- Add an `e2e` workspace package with `playwright` and `@effect/vitest`. Its global setup attaches to `E2E_URL`, or boots `vp run dev`, and waits for `/infra`.
- Port executor's `scenario()` without the viewer, film splicing or test-source extraction. Add `Target`, `Api`, `Browser`, `NetControl` and `Storage` as TESTING.md describes.
- Before building on either of these, verify:
  - Better Auth's `testUtils` plugin (1.7.4) can create users and sessions in workerd through the Drizzle D1 adapter.
  - Which bucket local dev presigns against, so `Storage` reads the same one.
- Add the dev-only identity route. `infra/alchemy.run.ts` sets the enabling binding for non-production stages only, and the route returns 404 without it.
- First scenarios:
  - refresh mid-upload resumes, and the ledger shows each part sent once
  - offline mid-part pauses, then resumes
  - lost finalize response converges to complete
  - browser relaunch with a persistent profile recovers the transfer
  - cancel aborts the remote upload
- Add an e2e workflow once the suite runs stable locally.

## Later

- `Restart`: restart `alchemy dev` while keeping local D1 and R2 state, for server-death scenarios.
- A context-budget report listing the largest files, the largest functions and fan-out, once code starts pressing against the ceilings.

# Agent guide

Make the smallest direct change. Use inferred types and named exports. New abstractions, helpers and test files need user approval. Keep `any` and casting wrappers out of application code.

## Read for the task

- Solid components or reactivity: [.agents/skills/solidjs-v2/SKILL.md](.agents/skills/solidjs-v2/SKILL.md). Check installed Solid docs and types. For any reactivity change, follow "Reactivity changes" below.
- Effect workflows or layers: [.agents/skills/effect/SKILL.md](.agents/skills/effect/SKILL.md). Installed package types take precedence over examples.
- Writing or reviewing any code (errors, unknown data, types, tests, run edges): [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
- Local serving: [.agents/skills/portless/SKILL.md](.agents/skills/portless/SKILL.md), then `vp run dev`.
- Product scope: [docs/VISION.md](docs/VISION.md). Product judgment and tone: [docs/SOUL.md](docs/SOUL.md).
- Upload, resume, download or cancellation: [docs/RELIABILITY.md](docs/RELIABILITY.md).
- Tests, scenarios or lint guardrails: [docs/TESTING.md](docs/TESTING.md). Remaining work: [docs/plan/03-testing-and-guardrails.md](docs/plan/03-testing-and-guardrails.md).
- Tool choices: [docs/STACK.md](docs/STACK.md). Code placement and request scope: [docs/STRUCTURE.md](docs/STRUCTURE.md). Effect reads in Solid: [docs/SOLID-EFFECT-BINDING.md](docs/SOLID-EFFECT-BINDING.md).
- Planned but not built: pre-launch observability (PostHog, Axiom, Sentry, Effect OpenTelemetry) and other deferred tools live in the STACK.md "Later" list.
- Next milestone: [docs/plan/01-foundation.md](docs/plan/01-foundation.md). Optional follow-up: [docs/plan/02-pre-upload-readiness.md](docs/plan/02-pre-upload-readiness.md).
- External precedent: `~/dev/tranzfer2-references/README.md`. Those checkouts can use different prereleases; verify syntax locally.

## Change and verify

- Use `vp` for package and project commands. After changes run `vp check`, `vp run test`, and the relevant `vp run build`. Report missing tests or blocked checks as such.
- Reactivity changes (components, memos, stores, actions): dev builds run with Solid diagnostics on (`diagnostics: true` in `apps/web/vite.config.ts`). Treat every code as a defect and never allowlist one you haven't understood. Prove the change with a `captureArtifact` test from `@solidjs/diagnostics` next to the component (see `apps/web/src/dashboard/dashboard.test.tsx` and [docs/TESTING.md](docs/TESTING.md)): `toHaveNoDiagnostics()` plus a re-run budget. Full repair guide: `apps/web/node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` (about 6k tokens, search it by code). Loop guide: `apps/web/node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`. Most codes come down to:
  - `STRICT_READ_UNTRACKED`, `PENDING_ASYNC_UNTRACKED_READ`: a reactive read outside a tracking scope (destructured props, component body). Read it in JSX, a memo or an effect's compute half; `untrack()` if a one-time snapshot is the intent.
  - `REACTIVE_WRITE_IN_OWNED_SCOPE`, `ACTION_CALLED_IN_OWNED_SCOPE`: a write, `refresh()` or action call during a component body or memo. Move it to an event handler or effect callback.
  - `FLUSH_IN_ACTION`, `FLUSH_IN_EFFECT_CALLBACK`: delete the `flush()`. In tests, call `flush()` before reading the DOM.
  - `NO_OWNER_EFFECT`, `NO_OWNER_CLEANUP`: create effects and `onCleanup` under a component or `createRoot`.
  - `UNSTABLE_MEMO_OUTPUT`: the memo returns fresh but equal objects. Return stable references or pass `equals`.
  - `HOT_SCOPE_*`, `HUGE_FAN_OUT`: a hot signal or one shared value read by many rows. Derive a slower value, or keep the answer in a store keyed by id.
  - `EFFECT_WRITES_OWN_SOURCE`, `EFFECT_RELAY_TEAR`: an effect that writes derived state. Use `createMemo`.
  - `IMMUTABLE_UPDATE_IN_STORE`, `UNSTABLE_LIST_IDENTITY`: mutate the store draft, or `reconcile(data, "id")`, and key `<For>` by a stable id.
  - `ASYNC_WATERFALL`: read every async source before using any, so they start together.
  - `SILENT_HOLD`, `LONG_HOLD`: add feedback with `isPending`, `latest` or an optimistic write. Never remove the hold; past 500 ms show a `Loading` fallback.
- Keep lint enabled. An exception needs user approval, a file-scoped override and a one-line reason.
- Comments explain runtime quirks and non-obvious constraints.
- When a check fails, reproduce it on unchanged `origin/main` before blaming the current diff.
- After the same step fails twice, stop and report the exact error and evidence.
- The API Worker's resources and bindings live in `apps/api` (`resources.ts`, `index.ts`); `infra/alchemy.run.ts` composes the stack. Each resource has one definition.
- Deploy only from the main checkout, after build and plan review. Leave generated `apps/web/file-routes.d.ts` unstaged.
- Staging lives at staging.tranzfer.app and deploys from the `dev` branch via CI; `main` deploys production. Manual staging deploy: `vp run --filter @tranzfer/infra deploy:staging`. Sign in with `POST /api/auth/staging-login`.
- Each same-repo PR deploys its own stack, stage `pr-<number>`, at `https://pr-<number>.tranzfer.app` and runs the e2e suite against it; closing the PR destroys it (`.github/workflows/preview.yml`). Use it to check your work on a real deployment. Only `production`, `staging`, `pr-<number>` and local `dev_<user>` stages boot; anything else fails the deploy.
- Delegate well-scoped implementation and verification to `run_subagent` swe-2 profiles (`subagent_general` for write work, `subagent_explore` for read-only); parallel agents get scratchpad worktrees under `~/dev/scratchpad/tranzfer2`.
- Worker `name` props stay unset: Alchemy derives stage-scoped names, and an explicit name makes every stage overwrite one worker.

## Keep the record useful

Docs hold standing decisions. Package manifests and configuration hold versions and commands. Commits, PRs and issues hold investigation, failures and progress.

Update a rule when a decision changes and cite the PR. Plan files contain remaining work; delete finished items and empty files. Before retrying a rejected approach, search recent commits and merged PRs for the reason.

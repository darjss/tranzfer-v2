# Agent guide

Make the smallest direct change. Use inferred types and named exports. New abstractions, helpers and test files need user approval. Keep `any` and casting wrappers out of application code.

## Read for the task

- Solid components or reactivity: [.agents/skills/solidjs-v2/SKILL.md](.agents/skills/solidjs-v2/SKILL.md). Check installed Solid docs and types. For any reactivity change, follow "Reactivity changes" below.
- Effect workflows or layers: [.agents/skills/effect/SKILL.md](.agents/skills/effect/SKILL.md). Installed package types take precedence over examples.
- Writing or reviewing any code (errors, unknown data, types, tests, run edges): [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
- Library docs, installed source paths and known pitfalls (Effect, Solid, Alchemy, drizzle, Panda, Vite+, Uppy, Better Auth): [docs/LIBRARIES.md](docs/LIBRARIES.md). Read it before you search `node_modules` or the web.
- Local serving: [.agents/skills/portless/SKILL.md](.agents/skills/portless/SKILL.md), then `vp run dev`.
- Product scope: [docs/VISION.md](docs/VISION.md). Plans, prices and limits: [docs/PRODUCT.md](docs/PRODUCT.md). Product judgment and tone: [docs/SOUL.md](docs/SOUL.md).
- Upload, resume, download or cancellation: [docs/RELIABILITY.md](docs/RELIABILITY.md). Measured gate results: [docs/BENCHMARKS.md](docs/BENCHMARKS.md).
- Tests, scenarios or lint guardrails: [docs/TESTING.md](docs/TESTING.md). Remaining work: [docs/plan/03-testing-and-guardrails.md](docs/plan/03-testing-and-guardrails.md).
- Tool choices: [docs/STACK.md](docs/STACK.md). Code placement and request scope: [docs/STRUCTURE.md](docs/STRUCTURE.md). Effect reads in Solid: [docs/SOLID-EFFECT-BINDING.md](docs/SOLID-EFFECT-BINDING.md).
- Traces, with log lines as span events: Axiom, described in the STACK.md observability lines. Never put a URL, query string, cookie, email or link token in a span attribute or log. Planned but not built: PostHog and Sentry, and other deferred tools in the STACK.md "Later" list.
- Next milestone: [docs/plan/01-foundation.md](docs/plan/01-foundation.md). Optional follow-up: [docs/plan/02-pre-upload-readiness.md](docs/plan/02-pre-upload-readiness.md).
- External precedent: `~/dev/tranzfer2-references/README.md`. Those checkouts can use different prereleases; verify syntax locally.

## Change and verify

- Use `vp` for package and project commands. After changes run `vp check --quiet`, `vp run test`, and the relevant `vp run build`, unpiped: the exit code is the verdict. Never pipe a gate through `tail`, `grep` or `head` without `set -o pipefail`; the pipe's exit code hides a failure. Report missing tests or blocked checks as such. `vp check --fix` also reports what it cannot fix, so run it once, not twice. In a new worktree run `vp install` first; it generates `styled-system` and `file-routes.d.ts`.
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
- Verify by running, not by reading. Reproduce a review-bot finding before fixing it, and before calling something a library bug state the minimal repro and the other form you tried (such as `typeof X`). Quote counts from command output.
- Cap a spike on a prerelease boundary (Solid, Effect, Alchemy, Panda, drizzle-kit) at 30 minutes, then stop and report a minimal repro.
- Never read `.env*` or print secret values. Pass them through the environment (`node --env-file`), not on a command line.
- Migrations: rebase on `origin/dev` first, then `cd packages/db && vp run generate --name <slug>`. A `--` before the flag reaches drizzle-kit and fails. After a merge, `vp exec drizzle-kit check` flags two migrations that fork from one parent; `git rm -r` yours and generate again. Never edit `snapshot.json`.
- The API Worker's resources and bindings live in `apps/api` (`resources.ts`, `index.ts`); `infra/alchemy.run.ts` composes the stack. Each resource has one definition.
- A new Cloudflare rate limit takes the next id in `rateLimitBindings` (`apps/api/src/index.ts`); the limit and window go in `rateLimits`. A duplicate id fails typecheck. Rebase and run `vp check` again before the PR.
- A worktree has no `.env`. A preview plan still runs there against the shared `~/.alchemy` Cloudflare profile: `ALCHEMY_STAGE=pr-0 POLAR_SANDBOX_ACCESS_TOKEN=x TEST_LOGIN_KEY=<32 or more characters> vp run --filter @tranzfer/infra plan:preview`. Production and staging plans need the main checkout's `.env`; report them as blocked. To renew an expired Cloudflare login, run `cd infra && node ./node_modules/alchemy/bin/cli.js profile refresh --profile default --provider Cloudflare` in a terminal on this box. Read D1 through Alchemy (`apps/api/scripts/stage.ts`), not `wrangler`.
- Deploy only from the main checkout, after build and plan review. From a worktree, push the PR and check its preview; never run `deploy:staging` there.
- Staging lives at staging.tranzfer.app and deploys from the `dev` branch via CI; `main` deploys production. Manual staging deploy: `vp run --filter @tranzfer/infra deploy:staging`. Sign in with `POST /api/auth/staging-login`.
- Each same-repo PR deploys its own stack, stage `pr-<number>`, at `https://pr-<number>.tranzfer.app` and runs the e2e suite against it; closing the PR destroys it (`.github/workflows/preview.yml`). Use it to check your work on a real deployment. Only `production`, `staging`, `pr-<number>` and local `dev_<user>` stages boot; anything else fails the deploy.
- Worker `name` props stay unset: Alchemy derives stage-scoped names. An explicit name bypasses stage scoping, so one staging deploy overwrote production's Workers and the domain reconcile detached `staging.tranzfer.app`.

## Parallel work and tools

- Run at most 3 subagents at once. Each commits and pushes after every green step, so a usage-limit or capacity kill leaves a branch. Resume a killed agent with `git log origin/dev..HEAD` and `git status`. Review agents get a shell, a worktree off `origin/dev` and the check to run; read-only reviewers approved bugs that a reviewer with a shell found.
- Each parallel agent gets its own worktree under `~/dev/scratchpad/tranzfer2` and its own branch. Never `rm`, `git clean`, `git stash` or `git checkout <branch>` in a checkout another thread may use, and never `pkill -f`; stop only the PID you started. Give each agent-browser its own `--session <task>-<role>`.
- Wait for CI with one backgrounded `gh pr checks <number> --watch --interval 60`, not a sleep loop. Read a failing log once with `gh run view <id> --log-failed`.
- Local pages: use `agent-browser`. The `preview_*` tools run remotely and reach only public URLs.
- ripgrep: `-r` means replace. Use `rg -n` and `rg -l`.
- Some agent shells are dash with a 30 s limit. Wrap bash-only syntax in `bash -c`, start servers with `setsid nohup ... &`, and poll in loops under 25 s.

## Keep the record useful

Docs hold standing decisions. Package manifests and configuration hold versions and commands. Commits, PRs and issues hold investigation, failures and progress.

Update a rule when a decision changes and cite the PR. Plan files contain remaining work; delete finished items and empty files. Before retrying a rejected approach, search recent commits and merged PRs for the reason.

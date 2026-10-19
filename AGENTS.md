# Agent guide

- NEVER write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, FIRST write all the ways it could fail, THEN write the code.

Unit tests written after the code restate it: they always pass, catch almost nothing and break on every refactor. Here E2E means the suite in `e2e/` that runs against a deployed stack, including each PR's preview. A case added to an existing service or component test counts as an isolated test.

Make the smallest direct change. Use inferred types and named exports. New abstractions, helpers and test files need user approval. Keep `any` and casting wrappers out of application code. Lint enforces most of the code rules; its messages say what to use instead.

## Read for the task

- Solid: the `solidjs-v2` skill. Effect: the `effect` skill. Panda: the `panda-css` skill. Installed types beat the skills.
- Library docs, installed source paths, renamed APIs and known pitfalls: [docs/LIBRARIES.md](docs/LIBRARIES.md). Read it before you search `node_modules` or the web.
- Writing or reviewing code: [docs/CONVENTIONS.md](docs/CONVENTIONS.md). Placement and request scope: [docs/STRUCTURE.md](docs/STRUCTURE.md). Effect reads in Solid: [docs/SOLID-EFFECT-BINDING.md](docs/SOLID-EFFECT-BINDING.md). Tools: [docs/STACK.md](docs/STACK.md).
- Product scope: [docs/VISION.md](docs/VISION.md). Plans, prices, limits: [docs/PRODUCT.md](docs/PRODUCT.md). Judgment and tone: [docs/SOUL.md](docs/SOUL.md).
- Upload, resume, download, cancel: [docs/RELIABILITY.md](docs/RELIABILITY.md) and [docs/BENCHMARKS.md](docs/BENCHMARKS.md). Tests and scenarios: [docs/TESTING.md](docs/TESTING.md).
- Remaining work: [docs/plan/](docs/plan/), starting with `01-foundation.md` and `deslop/00-index.md`.
- Local serving: the `portless` skill, then `vp run dev`.
- External precedent: `~/dev/tranzfer2-references/README.md`. Those checkouts use other prereleases; verify syntax locally.
- Never put a URL, query string, cookie, email or link token in a span attribute or log. Traces go to Axiom (STACK.md).

## Change and verify

- In a new worktree run `vp install` first; it generates `styled-system` and the route types. After changes run `vp check --quiet`, `vp run test` and the relevant `vp run build`, unpiped, or with `set -o pipefail`: the exit code is the verdict. Report missing tests or blocked checks as such.
- Reactivity changes: dev builds report Solid diagnostics. Treat every code as a defect and never allowlist one you haven't understood. Read the codes while you exercise the change in `vp run dev`; common repairs are in LIBRARIES.md. If you cannot run the dev server (a worktree has no `.env`), say so.
- Keep lint enabled. An exception needs user approval, a file-scoped override and a one-line reason. A new rule goes in at error with every hit fixed: custom rules in `tools/oxlint/anti-slop/tranzfer/`, each with a RuleTester test, the one exception to the test-file rule.
- Comments explain runtime quirks and non-obvious constraints.
- Verify by running, not by reading. Quote counts from command output. Reproduce a failing check on unchanged `origin/dev` before blaming the diff, and a review-bot finding before fixing it.
- After the same step fails twice, stop and report the exact error. Cap a spike on a prerelease (Solid, Effect, Alchemy, Panda, drizzle-kit) at 30 minutes, then report a minimal repro.
- Never read `.env*` or print secrets. Pass them through the environment (`node --env-file`).
- Migrations: rebase on `origin/dev`, then `cd packages/db && vp run generate --name <slug>`. If `vp exec drizzle-kit check` reports a fork after a merge, `git rm -r` yours and generate again. Never edit `snapshot.json`.
- The API Worker's resources and bindings live in `apps/api` (`resources.ts`, `index.ts`); `infra/alchemy.run.ts` composes the stack. A rate limit is one row in `bindingLimits` (`apps/api/src/rate-limiter.ts`); one the client sees also goes in `rateLimits` (contracts) and the web `tooMany` copy. Worker `name` props stay unset: an explicit name once let staging overwrite production's Workers.

## Deploys

- Deploy only from the main checkout, after build and plan review. From a worktree, push and check the PR preview.
- Each same-repo PR deploys stage `pr-<number>` at `https://pr-<number>.tranzfer.app` and runs the e2e suite there. `dev` deploys staging.tranzfer.app (sign in with `POST /api/auth/staging-login`); `main` deploys production.
- A worktree can still plan a preview: `ALCHEMY_STAGE=pr-0 POLAR_SANDBOX_ACCESS_TOKEN=x TEST_LOGIN_KEY=<32+ chars> vp run --filter @tranzfer/infra plan:preview`. Staging and production plans need the main checkout's `.env`.

## Parallel work

- At most 3 subagents at once, each in its own worktree under `~/dev/scratchpad/tranzfer2` on its own branch, committing and pushing after every green step so a killed agent leaves a branch. Reviewers get a shell and the check to run: read-only reviewers approved bugs that one with a shell caught.
- Never `rm`, `git clean`, `git stash` or `git checkout <branch>` in a checkout another thread may use, and never `pkill -f`; stop only the PID you started.
- Wait for CI with one backgrounded `gh pr checks <number> --watch --interval 60`. Read a failure once with `gh run view <id> --log-failed`.
- Local pages: `agent-browser`, with its own `--session` per agent. Dash shells with a 30 s limit: wrap bash syntax in `bash -c` and start servers with `setsid nohup ... &`.

## Keep the record useful

Docs hold standing decisions. Manifests and configuration hold versions and commands. Commits, PRs and issues hold investigation and progress. When a mistake repeats, make it a lint rule, a type or a check before you write prose about it.

Update a rule when a decision changes and cite the PR. Plan files contain remaining work; delete finished items and empty files. Before retrying a rejected approach, search recent commits and merged PRs for the reason.

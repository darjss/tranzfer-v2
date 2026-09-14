# Agent Guide

This is a SolidJS 2.x project. Solid is not React: components run once (there is no re-render), reactivity is fine-grained through signals, and effects/memos have Solid-specific semantics. Do not port React patterns.

Before writing, editing, or explaining Solid code, read `.agents/skills/solidjs-v2/SKILL.md` and the references it routes for the affected behavior. Installed package typings, runtime, and `node_modules/solid-js/CHEATSHEET.md` take precedence over that skill's rc.5 reference material.

## Versioned skills (in node_modules — read on demand)

The installed packages ship agent skills that match their exact installed versions:

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` — repair guide mapping every dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`, `STRICT_READ_UNTRACKED`) to its prescribed fix. Read it whenever a Solid diagnostic code appears in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md` — how to capture reactive evidence (which scopes re-ran and why, wasted recomputes, cost tables) and assert budgets, in tests and against live pages.

## Reactive diagnostics — capture evidence instead of guessing

Use these whenever you are debugging reactivity (something doesn't update, updates too often, or is slow) or verifying a change didn't regress update granularity:

- **In tests:** `captureArtifact()` from `@solidjs/diagnostics` wraps a scenario and returns a serializable artifact of diagnostics + rerun attribution; matchers from `@solidjs/diagnostics/vitest` (`toHaveNoDiagnostics`, `toStayWithinRerunBudget`, `toHaveNoWaste`, …) assert on it. No browser needed.
- **Against the running web dev server** (`diagnostics: true` in `apps/web/vite.config.ts`; dev-only, no-op in builds). Requires an open page connected to the web app:
  - `GET /__solid/diagnostics` — status and connected client count
  - `POST /__solid/diagnostics` with JSON `{"method":"begin"}` then `{"method":"end"}` — capture a session into an artifact
  - `{"method":"whyDidRun","params":{"name":"<scope name>"}}` — recorded re-runs of one named scope in the open session
  - `{"method":"costs"}` — running cost tables for the open session

Name your signals/memos/effects (the `{ name: "..." }` option) — attribution reports scopes by name.

## Repo layout, scripts, deploys

The selected application architecture is Effect 4 with Effect RPC and Effect
Schema. See `docs/STACK.md` and `docs/plan/02-pre-upload-readiness.md` for the
migration. Existing Elysia/Eden, Better Result, and Valibot packages await removal;
do not extend their use. Solid owns UI reactivity, Uppy owns multipart transport,
and persistent metadata plus R2 own recovery truth. Fiber interruption and UI
disposal must not implicitly cancel durable uploads. Use shared RPC schemas for
client/server contracts and keep file bytes out of RPC.

### Effect skills and version authority

For Effect setup, read `.agents/skills/effect-ts/SKILL.md`. Before writing or
explaining Effect code, read the owning package's installed `effect/AGENTS.md`
completely, then follow its relevant topic links and inspect its source/types.
Resolve Effect from the package being changed. Today infrastructure owns the
installed copy at `infra/node_modules/effect`; after migration, application
packages may resolve a different version. Do not use infrastructure docs as
authority for a different application release or install/upgrade Effect merely
to obtain documentation. Package installation follows the readiness plan.

Use `.agents/skills/effect/SKILL.md` and its matching references for supplemental
v4 patterns. Project decisions and installed package APIs take precedence over
its examples. In particular:

- Keep T3 Env with Effect Schema as the configuration boundary. Supply validated
  values to services rather than adding a second environment schema via Config.
- Keep ordinary named exports and inferred types unless a real contract needs
  more. Do not adopt self-exporting module namespaces, redundant interfaces,
  generic error wrappers, or separate test services by default.
- Stream, Cache, and scoped background work require an actual application need.
  They do not replace Solid state, Uppy mechanics, or durable recovery metadata.
  Worker work must respect its request/event lifetime; a fiber is not a job queue.
- New test files and test-only helpers still require explicit user approval.
  Use existing project test commands, not commands from another repository.

These skills do not establish RPC or Solid integration compatibility. Verify
those APIs and lifetimes against the selected package versions when implementing
them. Do not copy Effect 3 or effect-smol examples into Effect 4 without checking.

pnpm workspace (`packageManager` is pinned in `package.json`; use `pnpm add` for dependencies, never another package manager — `catalog:` specifiers only resolve with pnpm). Packages: `apps/web` (Solid 2 site + Worker, `@tranzfer/web`), `apps/api` (API Worker, currently Elysia pending Effect RPC migration, `@tranzfer/api`), `infra` (Alchemy v2 stack, `@tranzfer/infra`).

Run root scripts with `pnpm <script>`:

| Script                              | What it does                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `dev`                               | Portless proxy in front of both apps (`dev:web`, `dev:api` run one)                                |
| `build` / `build:web` / `build:api` | Production builds; web prerenders `/` to `apps/web/dist/client/index.html` via `prerender-crawler` |
| `check`, `lint`, `fmt`, `test`      | Vite+ format + lint + typecheck (`check --fix` to autofix), tests                                  |
| `plan`                              | Alchemy diff of the Cloudflare stack, no changes applied                                           |
| `deploy` / `destroy`                | Alchemy apply / tear-down (use `pnpm run deploy` — bare `pnpm deploy` is reserved by pnpm)         |

Web and API deploy together — the stack in `infra/alchemy.run.ts` is the only production source of truth and binds `API` (service binding) into the web Worker. `apps/api/wrangler.jsonc` is for local `wrangler dev` only. Alchemy state is local (`infra/.alchemy`, gitignored); Cloudflare auth comes from the usual `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` env or a `wrangler login` session. Run `pnpm plan` before `pnpm run deploy`, and `pnpm build` first when touching `apps/web` (the deploy builds too, but `build` surfaces prerender errors faster).

Solid SSR footgun seen in this repo: never wrap `onSettled` (or any owner-creating primitive) in `if (!isServer)`. The server stubs consume a hydration id so client keys stay aligned; guarding them shifts every key and hydration fails at the first element (`Hydration tag mismatch`). Third-party primitives that do this internally must be created after the component's JSX.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

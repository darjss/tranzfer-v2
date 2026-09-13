# Agent Guide

This is a SolidJS 2.x project. Solid is not React: components run once (there is no re-render), reactivity is fine-grained through signals, and effects/memos have Solid-specific semantics. Do not port React patterns.

Before writing, editing, or explaining Solid code, read `.agents/skills/solidjs-v2/SKILL.md` and the references it routes for the affected behavior. Installed rc.6 package typings, runtime, and `node_modules/solid-js/CHEATSHEET.md` take precedence over that skill's rc.5 reference material.

## Versioned skills (in node_modules — read on demand)

The installed packages ship agent skills that match their exact installed versions:

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` — repair guide mapping every dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`, `STRICT_READ_UNTRACKED`) to its prescribed fix. Read it whenever a Solid diagnostic code appears in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md` — how to capture reactive evidence (which scopes re-ran and why, wasted recomputes, cost tables) and assert budgets, in tests and against live pages.

## Reactive diagnostics — capture evidence instead of guessing

Use these whenever you are debugging reactivity (something doesn't update, updates too often, or is slow) or verifying a change didn't regress update granularity:

- **In tests:** `captureArtifact()` from `@solidjs/diagnostics` wraps a scenario and returns a serializable artifact of diagnostics + rerun attribution; matchers from `@solidjs/diagnostics/vitest` (`toHaveNoDiagnostics`, `toStayWithinRerunBudget`, `toHaveNoWaste`, …) assert on it. No browser needed.
- **Against the running dev server** (`diagnostics: true` in vite.config.ts; dev-only, no-op in builds). Requires an open page connected to the dev server (e.g. via a browser tool):
  - `GET /__solid/diagnostics` — status and connected client count
  - `POST /__solid/diagnostics` with JSON `{"method":"begin"}` then `{"method":"end"}` — capture a session into an artifact
  - `{"method":"whyDidRun","params":{"name":"<scope name>"}}` — recorded re-runs of one named scope in the open session
  - `{"method":"costs"}` — running cost tables for the open session

Name your signals/memos/effects (the `{ name: "..." }` option) — attribution reports scopes by name.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

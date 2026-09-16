# Agent guide

Smallest direct change. Inference over annotations, named exports, no `any`,
no wrapper functions that only rename or cast. New abstractions, test files,
and helpers need the user's approval first.

## Read first

- Architecture: `docs/STACK.md`. Current step: `docs/plan/02-pre-upload-readiness.md`.
- Transfer rules: `docs/RELIABILITY.md`. Solid owns UI, Uppy owns multipart
  transport, D1 plus R2 own recovery. UI disposal or fiber interruption never
  aborts a remote upload.
- Solid 2: `.agents/skills/solidjs-v2/SKILL.md`, then
  `~/dev/tranzfer2-references/solid2` (docs, blogs, source checkouts). Installed
  types win over checkouts. Diagnostics:
  `solid-js/skills/reactivity-diagnostics/SKILL.md`.
- Effect 4: `.agents/skills/effect/SKILL.md`, then the installed
  `effect/AGENTS.md` in `node_modules`, then `~/dev/tranzfer2-references/effect`
  (effect, effect-smol, website, examples checkouts). Services sit at real
  boundaries (persistence, storage, auth). Solid state and Uppy progress stay
  out of Effect.
- Local dev and URLs: `.agents/skills/portless/SKILL.md` before `vp run dev`.

## Working rules

- Every command goes through `vp` (`vp add`, `vp check`, `vp run <script>`).
  After a change: `vp check`, `vp run test`, the relevant `vp run build`.
- Lint stays on. A violation is a prompt to refactor toward the rule's intent.
  A genuine exception (a factory the rule misreads, a declaration-merging
  `.d.ts`) gets a file-scoped override with a one-line reason, and the user
  approves it first.
- Comments explain only behaviour a reader cannot infer from the code: a
  runtime quirk, an outlier case, a non-obvious constraint. Everything else is
  named code.
- One stack. `infra/alchemy.run.ts` owns bindings for `alchemy dev` and deploy;
  there are no per-app Wrangler configs or local-only binding hacks.
- Bounded attempts. When the same step fails twice, stop and report the
  evidence (logs, exact error) instead of a third variant.
- Deploy from the main checkout: `vp run build`, `vp run plan`, then
  `vp run deploy`. Leave `apps/web/file-routes.d.ts` and `solid-env.d.ts`
  unstaged; Vite regenerates them.

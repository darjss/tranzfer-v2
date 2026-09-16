# Agent guide

Smallest direct change. Inference over annotations, named exports, no `any`,
no wrapper functions that only rename or cast. New abstractions, test files,
and helpers need the user's approval first.

## Read order

Work outward; stop when the question is answered.

1. **Skills** — how to write in a stack. `.agents/skills/solidjs-v2/` before
   Solid work, `.agents/skills/effect/` before Effect work,
   `.agents/skills/portless/` before `vp run dev`. Installed `node_modules`
   types beat every doc and checkout. Solid diagnostics:
   `solid-js/skills/reactivity-diagnostics/SKILL.md`.
2. **Docs** — what this project decided. `docs/STACK.md` for the stack,
   `docs/RELIABILITY.md` for transfer invariants (Solid owns UI, Uppy owns
   multipart transport, D1 plus R2 own recovery, UI disposal never aborts a
   remote upload), `docs/STRUCTURE.md` for where code lives and the DI/layer
   patterns, `docs/SOLID-EFFECT-BINDING.md` for the Effect↔Solid bridge,
   `docs/plan/` for the current step.
3. **References** — how real codebases do it. `~/dev/tranzfer2-references/`
   holds 30+ checkouts plus `audits/` reports; its README indexes them by
   what they're good for. Mine for precedent and shape, not syntax — the
   checkouts span mixed beta/RC versions.

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

## Docs and ledger

Docs state rules. Git is the ledger: what happened, what failed, and why
lives in commit messages, PR bodies, and issues. Status never enters docs.

- `docs/STACK.md`, `docs/RELIABILITY.md`, `docs/VISION.md`, `docs/SOUL.md`,
  `docs/STRUCTURE.md` hold standing decisions. Rules only: no versions,
  install state, or progress notes. Versions come from `package.json` and the
  lockfile.
- PR bodies carry the why: approaches tried, failures hit, decisions made.
  Link the issue when one exists.
- Edit a doc when a decision changes. If work proves a rule wrong, fix the
  rule and cite the PR.
- `docs/plan/` files list remaining work. Delete finished items; delete the
  file when empty.
- Before re-trying a replaced approach or reverting a decision, search the
  ledger: `git log --oneline -30`, `gh pr list --state merged`,
  `gh search prs "<term>"`, `gh pr view <n>`.

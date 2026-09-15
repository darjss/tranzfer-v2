# Agent guide

Make the smallest direct change. Prefer inference and named exports. No `any`,
speculative abstractions, or new test files/helpers without explicit approval.

## Read first

- Architecture: `docs/STACK.md`. Current work: `docs/plan/02-pre-upload-readiness.md`.
- Product: `docs/SOUL.md`. Long-term direction: `docs/VISION.md`. Do not build
  later phases until Phase 0 reliability is proven.
- Transfer behavior: `docs/RELIABILITY.md`. Solid owns UI, Uppy owns multipart
  transport, and persistent metadata plus R2 own recovery. UI disposal or fiber
  interruption must never implicitly abort remote uploads.
- Effect 4 + RPC + Schema is selected. Elysia/Eden, Better Result, and Valibot
  await removal; do not extend their use. Keep T3 Env as the env boundary.

## Solid 2 lookup order

1. Read `.agents/skills/solidjs-v2/SKILL.md` and the relevant routed reference.
2. Look in `~/dev/solid2-reference/solid-docs` and `solid2-blogs` under that same
   reference directory for explanations and examples.
3. For unresolved behavior or hard bugs, inspect the matching source checkout
   there: `solid`, `solid-router`, `vite-plugin-solid`, `kobalte`, or
   `solid-primitives`. Installed types/runtime and `solid-js/CHEATSHEET.md` settle
   version conflicts. Do not assume a checkout matches our installed release.

For Solid diagnostic codes, read the owning package's
`solid-js/skills/reactivity-diagnostics/SKILL.md`. For stale/excessive updates or
performance regressions, read `@solidjs/diagnostics/skills/agent-loops/SKILL.md`
and capture evidence. Name reactive scopes. Never guard `onSettled` with
`if (!isServer)`; it breaks hydration ID alignment.

## Effect guidance

Use `.agents/skills/effect-ts/SKILL.md` for setup and
`.agents/skills/effect/SKILL.md` for topic guidance. First read the owning
package's installed `effect/AGENTS.md` completely; installed docs/types outrank
examples. Today that copy is in `infra/node_modules/effect`. Do not upgrade or
add dependencies merely to read docs. Services belong at real boundaries;
keep Solid state and Uppy progress out of Atom/Stream abstractions.

## Commands and deploys

Run every command through `vp`. `vp install`, `vp add`, and `vp remove` for
dependencies. `vp <name>` for built-ins (`check`, `lint`, `fmt`). `vp run <name>`
for package scripts (`dev`, `test`, `build`, `plan`, `deploy`). Vite+ docs:
`node_modules/vite-plus/docs`. `apps/web` is the Solid site/Worker, `apps/api`
the API Worker, and `infra` the Alchemy stack.

After code changes run `vp check`, existing tests with `vp run test`, and the
relevant `vp run build`. Local URLs go through Portless. Read
`.agents/skills/portless/SKILL.md` before starting or debugging `vp run dev`.

Deploy only from the main checkout through `infra/alchemy.run.ts`, which owns
both apps and production resources. Run `vp run build`, `vp run plan`, then
`vp run deploy`. Local dev runs through `alchemy dev` from the same stack;
there are no app Wrangler configs. Preserve the user's existing generated-file
changes.

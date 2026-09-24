# Agent guide

Make the smallest direct change. Use inferred types and named exports. New abstractions, helpers and test files need user approval. Keep `any` and casting wrappers out of application code.

## Read for the task

- Solid components or reactivity: [.agents/skills/solidjs-v2/SKILL.md](.agents/skills/solidjs-v2/SKILL.md). Check installed Solid docs and types; use its reactivity diagnostics guide for reported diagnostics.
- Effect workflows or layers: [.agents/skills/effect/SKILL.md](.agents/skills/effect/SKILL.md). Installed package types take precedence over examples.
- Local serving: [.agents/skills/portless/SKILL.md](.agents/skills/portless/SKILL.md), then `vp run dev`.
- Product scope: [docs/VISION.md](docs/VISION.md). Product judgment and tone: [docs/SOUL.md](docs/SOUL.md).
- Upload, resume, download or cancellation: [docs/RELIABILITY.md](docs/RELIABILITY.md).
- Tool choices: [docs/STACK.md](docs/STACK.md). Code placement and request scope: [docs/STRUCTURE.md](docs/STRUCTURE.md). Effect reads in Solid: [docs/SOLID-EFFECT-BINDING.md](docs/SOLID-EFFECT-BINDING.md).
- Next milestone: [docs/plan/01-foundation.md](docs/plan/01-foundation.md). Optional follow-up: [docs/plan/02-pre-upload-readiness.md](docs/plan/02-pre-upload-readiness.md).
- External precedent: `~/dev/tranzfer2-references/README.md`. Those checkouts can use different prereleases; verify syntax locally.

## Change and verify

- Use `vp` for package and project commands. After changes run `vp check`, `vp run test`, and the relevant `vp run build`. Report missing tests or blocked checks as such.
- Keep lint enabled. An exception needs user approval, a file-scoped override and a one-line reason.
- Comments explain runtime quirks and non-obvious constraints.
- After the same step fails twice, stop and report the exact error and evidence.
- `infra/alchemy.run.ts` owns dev and production bindings. Keep a single infrastructure definition.
- Deploy only from the main checkout, after build and plan review. Leave generated `apps/web/file-routes.d.ts` and `apps/web/solid-env.d.ts` unstaged.

## Keep the record useful

Docs hold standing decisions. Package manifests and configuration hold versions and commands. Commits, PRs and issues hold investigation, failures and progress.

Update a rule when a decision changes and cite the PR. Plan files contain remaining work; delete finished items and empty files. Before retrying a rejected approach, search recent commits and merged PRs for the reason.

# Plan 24: Stop one typo from destroying production, and test what ships

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. Anything that changes who can deploy or which secrets a job sees is a question for the founder first (steps 4-5). Do not run `deploy`, `destroy` or `plan` against production yourself. No new test files without approval. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- package.json infra/package.json apps/api/src/resources.ts .github`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW | **Depends on**: none | **Category**: dx / security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

1. **`vp run destroy` is one command from deleting production.** Root `package.json:21` maps `destroy` to `vp run --filter @tranzfer/infra destroy`, and `infra/package.json` runs it as `alchemy destroy --yes --stage production` (and `deploy` likewise with `--yes`). `README.md` tells people to run `vp run deploy`. Neither the production D1 database (`resources.ts:20`, `Cloudflare.D1.Database("App", ...).pipe(Alchemy.remote())`) nor the R2 bucket (`:26`) has a removal policy; only the Polar products use `retain()` (`index.ts:65-67`). R2 refuses to delete a non-empty bucket (the repo's own comment at `resources.ts:45-46` says so), D1 and the Workers have no such guard.
2. **Production ships without the tests.** `deploy.yml:33` runs `vp check` and then deploys on every push to `main` or `dev`; `vp run test` runs only in `verify.yml:24`, on pull requests. A direct push, or a merge whose checks were skipped, deploys untested code.
3. **Nothing watches dependencies.** There is no Dependabot or scheduled audit. `pnpm audit --prod --audit-level high` reports 5 high advisories, all in build-time transitive packages (hono via `alchemy>@prisma/dev`, lodash, braces via `@solidjs/router>filesystem-routing`); none is in Worker runtime code, so this is tracking, not urgent.
4. **Preview jobs hold staging secrets.** `preview.yml` runs PR branch code (same-repo PRs only, forks excluded at `:25`) with `TEST_LOGIN_KEY`, `POLAR_SANDBOX_ACCESS_TOKEN` and `CLOUDFLARE_API_TOKEN` in the environment (`:40-44,55,76-78`); `deploy.yml` uses a secret with the same name `CLOUDFLARE_API_TOKEN` for production (`:48,60`). The repo cannot show whether GitHub environment secrets give production and staging different tokens.

## Current state

`package.json:20-21`, `infra/package.json` `deploy`/`destroy` scripts, `resources.ts:20-60`, `deploy.yml:12-60`, `preview.yml:13-78`, `verify.yml` (check + test on PRs, actions pinned by SHA, `permissions: contents: read`).

## Commands you will need

| Purpose             | Command                                                                         | Expected                                |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------- |
| Check               | `vp check`                                                                      | exit 0                                  |
| Plan on a dev stage | `vp run plan` is production-pinned; for infra changes use the PR preview deploy | resource diff shows only removal policy |

## Scope

**In scope**: `package.json` (root scripts), `infra/package.json`, `apps/api/src/resources.ts`, `.github/workflows/deploy.yml`, new `.github/dependabot.yml`, `README.md`.
**Out of scope**: GitHub environment settings (the founder changes them in the UI), secret rotation, the preview workflow's job structure.

## Steps

1. **Remove the production foot-guns.** Delete the root `destroy` script and the infra `destroy` script (keep `destroy:preview`). Rename `deploy`/`plan` so the stage is explicit in the name (`deploy:production`, `plan:production`) and drop `--yes` from the local production deploy (CI passes it itself). Update `README.md` and `docs/` mentions (`rg -n "vp run (deploy|destroy|plan)\b" . --glob '!node_modules'`) and `deploy.yml` (`vp run deploy` becomes `vp run deploy:production`).
2. **Retain production data.** In `resources.ts` apply `retain()` (import `retain` from `alchemy/RemovalPolicy`, as `index.ts:5` does) to `App` and `Files` when the stage is production only (previews must still destroy, `forceDestroy` for R2 is already conditional at `:47-49`). Check how Alchemy applies a removal policy to a resource built with `.pipe(Alchemy.remote())` in 2.0.0-beta.81 before choosing the shape; if conditional application is awkward, apply it unconditionally and let preview teardown use `destroy:preview`'s force path (verify on one preview that it still deletes). **Verify** on a PR preview: close the PR and confirm the preview stack's D1 and R2 are deleted; and `vp run plan` (production, read-only, ask the founder to run it) shows no resource change other than the policy.
3. **Test before production.** In `deploy.yml` add `- run: vp run test` after `vp check`.
4. **Dependabot.** Add `.github/dependabot.yml` for `github-actions` (weekly) and `npm` (weekly, grouped minor/patch). The workflows pin actions by SHA, so Dependabot will propose SHA bumps with comments; keep that.
5. **Ask the founder**: (a) are `CLOUDFLARE_API_TOKEN` in the `staging` and `production` GitHub environments two different tokens, and is the staging one limited to the staging stacks? (b) should the `production` environment require a reviewer? Record the answers; do not change settings yourself.

## Test plan

No test files. Verification is the preview teardown check in step 2 and a green `deploy.yml` run on `dev` after step 3.

## Done criteria

- [ ] `rg -n "destroy" package.json infra/package.json` shows only `destroy:preview`
- [ ] `deploy.yml` runs `vp run test` before any deploy step
- [ ] `.github/dependabot.yml` exists
- [ ] Production D1 and R2 carry a removal policy (shown by the Alchemy plan, run by the founder)

## STOP conditions

- Retaining the D1 or R2 breaks preview stack destruction (previews must remain disposable).
- Alchemy's `retain()` cannot be applied to a `.pipe(Alchemy.remote())` resource in this beta.

## Maintenance notes

Staging login gating: `providers("production")` is where the test login is never registered (`infrastructure/auth.ts:155-167`) and unknown stage names die (`stage.ts:45-49`). No test covers that gate. A one-case test in `apps/api/test` asserting that the production provider config has no plugin even when `TEST_LOGIN_KEY` is set would pin it; it needs the founder's approval as a new test file, so it is proposed here, not written.

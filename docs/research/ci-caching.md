# GitHub Actions caching for Tranzfer

Status: notes for plan step 3 in [02-pre-upload-readiness.md](../plan/02-pre-upload-readiness.md).
Research date: 2026-09-15.

The plan already decides the policy: cache **dependency downloads**, not
successful validation results. GitHub does not turn that on by itself for this
repo.

## What is automatic

Nothing useful is automatic today. There is no `.github/workflows` directory.

[`actions/setup-node`](https://github.com/actions/setup-node/blob/main/README.md)
auto-caches **npm** when `package.json` `packageManager` is npm. This repo pins
`packageManager: pnpm@12.4.1`. For Yarn and pnpm, setup-node caching is
**off until you set `cache: pnpm`**. pnpm itself must already be on PATH.

[`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) is the
Vite+ first-party CI action. Its `cache` input defaults to **`false`**. With
`cache: true` it caches the **pnpm store** (not `node_modules`) keyed as
`vite-plus-{OS}-{arch}-{pm}-{lockfile-hash}` after auto-detecting
`pnpm-lock.yaml`. Pin an exact `setup-vp` release or commit SHA. Do not use
the moving `v1` tag (frozen at v1.15.0). Installed Vite+ docs:
`node_modules/vite-plus/docs/guide/ci.md`.

pnpm on CI already uses frozen lockfile when it detects CI, and fails on an
incompatible lockfile major since pnpm 11
([pnpm continuous-integration](https://pnpm.io/continuous-integration)). That
is lockfile safety, not a download cache.

## What to cache

Cache the pnpm **store**. That is the content-addressed package pool. After
restore, `vp install` still links `node_modules` from the store. Do not cache
`node_modules` as the primary artifact: pnpm expects hard links from the store
on the same disk ([pnpm storeDir](https://pnpm.io/settings/store)).

Smallest workflow that matches this repo:

```yaml
- uses: actions/checkout@v6
- uses: voidzero-dev/setup-vp@<exact-release>
  with:
    node-version: "24"
    cache: true
- run: vp install
- run: vp check
```

`setup-vp` `cache-save` defaults to true when `cache` is true. Saving only
from `push` to `main` is optional and keeps PR merge-ref caches from eating
the 10 GB repo quota:

```yaml
cache: true
cache-save: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
```

PRs can still **restore** the main-branch store. GitHub cache scope: a run
restores from the current branch, then the default branch. A cache saved by
`pull_request` is scoped to `refs/pull/.../merge` and is not reused by other
PRs or by `main`
([dependency caching reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)).
Warm the store with a trusted `push` to `main` or the cache stays cold for
every new PR.

pnpm’s own docs say store caching is **not required** and is **not guaranteed**
to make install faster. Measure the restore+save time against a cold
`vp install`. Since pnpm 11.22.0 they also recommend caching the metadata
cache (`pnpm cache path`) because lockfile policy re-check can dominate once
the store is warm. `setup-vp` documents the store only. Add metadata cache
later if install stays slow after a store hit.

Do not let untrusted jobs write a store that privileged jobs restore. The
store is in pnpm’s trust domain. GitHub already blocks most low-trust triggers
from writing default-branch caches. `pull_request` writes stay on the merge
ref.

## What not to cache

Do not cache lint, format, tsc, or build “success”. The plan forbids caching
validation results. Vite+ can persist `vp run` task output in
`node_modules/.vite/task-cache` and restore it across runs
(`node_modules/vite-plus/docs/guide/github-actions-cache.md`). That is
experimental, only applies to `vp run` tasks (not `vp check` / `vp build`
invoked directly), and would skip re-running checks when fingerprints match.
Skip it for step 3.

Do not put Alchemy stack state in Actions cache. Step 4 of the same plan
forbids that.

Do not cache `dist/`, Wrangler output, or Playwright browsers unless a later
smoke job proves the download cost. Those are not dependency downloads.

Do not treat an empty `vp run test` as coverage. Cache does not change that.

## Speed that is not a cache

GitHub-hosted runners start empty. The expensive parts are usually pnpm
download, then web production build (Vite + workerd + prerender), then API
wrangler bundle. Oxlint/Oxfmt here is seconds, not minutes.

Cancel superseded PR runs:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Keep verification one job until a step is slow enough to pay for extra
installs. A matrix of lint vs build vs typecheck multiplies `vp install`
unless you split artifacts, which this phase does not need.

Keep Node and pnpm versions pinned (`packageManager`, setup-vp
`node-version`). Changing either busts the store key, which is correct.

Fork PRs and `pull_request_target` are restore-mostly. Do not depend on a
fork writing a cache that `main` later trusts.

## GitHub limits that bite a small repo

Default cache budget is **10 GB per repository**, unused entries drop after
**7 days**, then LRU eviction
([same reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)).
Many PR-scoped caches will evict the useful `main` store. Prefer one store
cache from `main` plus restore on PRs.

Caches are not a secrets store. Anyone who can open a PR can read cache
contents from branches they can restore.

## Recommendation for step 3

Use `voidzero-dev/setup-vp` with `cache: true`, then `vp install` and the
same local commands (`vp check`, `vp run --filter @tranzfer/web
build`, API dry-run). Optionally save the store only from `main`. Do not add
Vite Task cache, `node_modules` cache, or Alchemy state cache. Measure
install time on the first two CI runs before adding a second cache path.

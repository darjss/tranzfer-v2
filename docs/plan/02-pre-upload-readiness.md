# Tooling and UI readiness before uploads

Complete this phase before starting the first transfer flow in
[01-foundation.md](01-foundation.md). The agreed scope is environment
validation, stricter linting, verification and deployment through GitHub
Actions, the remaining agreed stack dependencies, and basic UI components
styled to match the home page. Read [STACK.md](../STACK.md) for package
ownership and [RELIABILITY.md](../RELIABILITY.md) before transfer work.

## Architecture decision

Adopt Effect 4 as the application programming model, with Effect RPC as the
primary first-party application boundary and Effect Schema for runtime schemas.
The user selected this direction in [issue #7](https://github.com/darjss/tranzfer-v2/issues/7).
Do not build a comparative spike or reopen the architecture choice during this
phase. Verify integrations while implementing the selected architecture.

STACK.md records this target architecture.

- Keep Solid 2 for UI/reactivity and Uppy for browser multipart transport.
  Do not run Effect in the browser for UI state, and do not wrap Uppy in
  Stream or Atom.
- Go all-in on the API Worker: Effect workflows, tagged failures, Layers at
  real boundaries, Effect Schema, and Effect RPC over HTTP for the web and a
  later desktop client. Define RPC input, success, and expected-error schemas
  once in shared contracts. Derive handlers and clients from those contracts.
- Host that Worker with [effect-cf](https://github.com/danieljvdm/effect-cf)
  `Worker.make` / `makeFetchHandler` as the only fetch adapter. Alchemy still
  deploys through `infra/alchemy.run.ts`. Do not run Alchemy's HTTP bridge and
  effect-cf's handler as competing request runtimes.
- `effect-cf` `rpc:` is Cloudflare Workers RPC (service-binding class methods).
  That is not Effect RPC. Browser and desktop use `effect/unstable/rpc` over
  HTTP (`RpcServer.toHttpEffect` in `fetch`).
- Use HTTP endpoints for Better Auth, Polar webhooks, health checks, and browser
  download links. Retain Better Auth and Alchemy.
- Talk to R2 through Distilled S3 (`@distilled.cloud/aws`) with an R2 endpoint
  override, `region: auto`, and S3 credentials. That path owns ListParts,
  presign for Uppy, and multipart create/abort/complete. Do not install
  `effect-cf` `R2.Tag` and do not send file bytes through Distilled `uploadPart`
  or `putObject`. `@distilled.cloud/cloudflare` is the account REST API, not
  object I/O.
- Use Drizzle v1 RC with `drizzle-orm/effect-d1` and `@effect/sql-d1`. Provide
  `D1Client` from the Worker binding (`effect-cf` `D1.sqlLayer` is the intended
  adapter). Do not keep a second raw-SQL API beside Drizzle.
- Keep file bytes travelling directly between the client and R2. RPC coordinates
  transfers; it does not carry multipart file payloads.

Services belong at real external boundaries such as persistence, storage, and
authentication. Pure calculations remain plain functions. Execute Effects at
application entry points rather than scattering runtime calls through domain
code. Do not add Atom for Solid state or Stream wrappers around Uppy progress.

Effect execution is process-local. D1 and browser durable metadata preserve
recovery identity; R2 remains authoritative for uploaded parts. Component
disposal, fiber interruption, and process cleanup must never implicitly abort
remote multipart uploads. Destructive cancellation is an explicit authorized
domain operation. Typed contracts do not replace authorization, idempotency,
file verification, or durable reconciliation.

Pin compatible Effect 4 releases and accept the maintenance cost of RC and
`effect/unstable/rpc` APIs. Revisit workspace-wide Effect overrides so Alchemy's
version requirements do not silently select the application's version. Keep
version-specific Effect objects within the runtime that owns them. The official
Solid integration example uses Effect 3 and is reference material, not a
verified Effect 4 adapter. Preserve service requirements without `any` when
implementing the integration.

Remaining Effect/RPC verification before the phase closes: schema rejection
and a client-aborted first request that does not hang the isolate.

## Lint policy

Locked by `lint.config.ts`, which is the source of truth. The durable
constraints:

- Extend `ultracite/oxlint/core`, then `ultracite/oxlint/anti-slop`. Do not
  maintain a vendored copy or add Antfu, nkzw, ESLint, or Biome alongside it.
- Effect lint comes from `@effect/tsgo`'s Oxlint plugin, `correctness` and
  `antipattern` presets only, scoped to Effect packages. Do not extend
  `recommended` or `effect-native`; they warn on `global-fetch`,
  `global-date`, `process-env`, and `async-function` and fight Solid, Uppy,
  T3 Env, and Worker bindings. Do not add `@effect/eslint-plugin` or community
  Oxlint packs.
- Keep type-aware linting and treat Solid reactivity diagnostics as errors.
- Any exception gets a file-scoped override with a one-line reason and user
  approval.

## Environment configuration

`@t3-oss/env-core` with Effect Schema Standard Schema maps owns configuration:

- `apps/web` uses the Solid plugin schema over `process.env` for public
  build-time values.
- `apps/api/src/env.ts` validates Node-side tooling config (the R2 probe).
- Worker runtime bindings arrive per-request, so they cannot be validated at
  module init. Services validate the binding fields they need with Schema at
  layer build (`Signing.layer` validates the R2 credential fields).

Keep D1, R2, and service-binding objects typed separately from string
environment variables. One authoritative schema per value; do not require
production credentials for a public landing-page build.

## 1. Extend GitHub Actions verification

The PR workflow runs `vp check`. Still deferred until core product
functionality lands:

- Browser/runtime smoke checks for the landing page, hydration, assets, and
  the web-to-API connection. Keep production credentials out of PR jobs.
- Schema-rejection and failure-injection probes.
- Test runs when tests exist; an empty run must not be reported as coverage.

Keep the workflow on pinned package-manager and Node versions with frozen
lockfile installs, minimal permissions, immutable action revisions, job
timeouts, and cancellation of superseded PR verification. Expose a stable
required check so added jobs cannot bypass merge requirements.

## 2. Production deploys

`infra/alchemy.run.ts` is the only production stack. It uses
`Cloudflare.state()`, the hosted Alchemy state store provisioned by
`alchemy provider cloudflare bootstrap`. `vp run plan|deploy|destroy` are
pinned to `--stage production`; `alchemy dev` keeps the per-user `dev_$USER`
stage. Because D1/R2 physical names are stage-derived, the production stage
owns `tranzfer-*-production-*` resources; the pre-migration `live_darjs`
storage is orphaned and pending deletion.

CI deploys after verification succeeds for the same commit on `main`, gated on
the `production` GitHub environment (scoped `CLOUDFLARE_API_TOKEN` secret plus
`CLOUDFLARE_ACCOUNT_ID` variable, deploys from `main` only). Serialize
production deploys without cancelling a running apply; cancel stale
verification work separately. Never expose deployment secrets to untrusted PR
code or print them in logs.

Check the deployed landing page and API health afterward. `/infra` probes
perform storage writes; keep destructive or privileged probes out of public
health checks. Do not claim a Worker rollback also rolls back database or
infrastructure changes.

Manual recovery: deploy from the main checkout with `vp run deploy`. If remote
state is lost, `alchemy provider cloudflare bootstrap` reprovisions the store
and `deploy --adopt` re-imports existing resources. If `CLOUDFLARE_API_TOKEN`
is revoked or expires, mint a replacement in the Cloudflare dashboard and
update the `production` environment secret.

## 3. Reconcile and install the agreed stack

Remaining checks:

- Exercise a real `drizzle-kit` migrate once the first schema lands —
  `d1-http` on rc.4 is broken for non-empty journals
  ([issue 5952](https://github.com/drizzle-team/drizzle-orm/issues/5952)), so
  migrate through a working path (Wrangler/Alchemy local execute, or a fixed
  kit release). Do not claim D1 readiness on an empty-database-only migrate.
- `@kobalte/core@2.0.0-alpha.2` renders SSR under Solid rc.8 but interaction
  is unverified and its peers pin rc.3. Verify in section 4's component work.
- TanStack Solid Form has no Solid 2-compatible release; re-check before form
  work.
- Drop the `drizzle-orm` patch once a tagged rc.5 lands (the npm `rc.5-*`
  builds are CI snapshots of an actively-rebased branch, not releases). Drop
  the `@distilled.cloud/*` rc.9 patches once Alchemy's transitive pins move
  past rc.9.

## 4. Prepare the local UI components

Extend the existing `apps/web/src/ui` directory and its Button and `cn` helpers.
Reuse the home page's typography, colors, borders, spacing, and interaction
style. Read the project Solid v2 skill and installed documentation before edits.

Proposed initial set: native Button and form fields, plus Kobalte Dialog,
AlertDialog, Popover, Tooltip, DropdownMenu, Select, and Tabs. Confirm the exact
set against the next upload screens and the compatible Kobalte release before
implementation. Use native elements for buttons, inputs, and layout. Keep
headless-component wrappers small and preserve their typed APIs. Chrome icons
are Phosphor Bold via `unplugin-icons`. Duotone only for empty or hero
moments, using `--color-blue` and `--color-ink`.

Check keyboard navigation, focus trapping and restoration, labels, disabled and
error states, small screens, and reduced motion where motion exists. Exercise
SSR and hydration and capture Solid diagnostics during interactions. Do not
introduce a second headless component ecosystem or implement upload behavior
inside this preparation work.

Complete when the selected components match the home page, their interactions
work in the browser without relevant Solid diagnostics, and lint, type checks,
format verification, and production builds pass.

## 5. Add pull request preview deployments

Deferred: implement after auth and the D1 schema land, when previews have
real flows to exercise.

On `pull_request`, deploy the same stack with `--stage pr-<number>` so every
PR gets isolated workers, D1, and R2 at a `*.workers.dev` URL. Fresh empty
storage per preview is intended — no production data in test stages. Post the
preview URL to the PR (sticky comment or deployment status) so agents and
humans can open it directly.

On `pull_request` `closed` (merged or not), destroy the `pr-<number>` stage in
the same job to prevent orphaned D1/R2/worker sprawl. Teardown must run even
when the PR is closed without merge.

Forks receive no secrets on `pull_request` by default; keep it that way. Only
branches in this repository get preview deploys. Reuse the `production`
environment's `CLOUDFLARE_API_TOKEN` or mint a dedicated preview token if
scoping diverges — do not widen the token for this.

Complete when a PR deploys an isolated stage, the URL is reachable, and
closing the PR tears the stage down.

## Handoff to core upload

Record the commands and deployed URLs that passed, the exact component set,
configuration ownership, and any unresolved blockers. Start the transfer flow
only after this phase's gates pass. Preserve the original reliability requirements
for resume, finalization, authorized downloads, cancellation, and expiration.

## Research references

- [Ultracite core](https://github.com/haydenbleasel/ultracite/tree/main/packages/cli/config/oxlint/core)
- [Ultracite anti-slop integration](https://github.com/haydenbleasel/ultracite/tree/main/packages/cli/config/oxlint/anti-slop)
- [Anti-slop upstream](https://github.com/dmmulroy/anti-slop)
- [vit-store lint stack](https://github.com/darjss/vit-store/pull/318)
- [vit-store deployment proposal](https://github.com/darjss/vit-store/pull/121)
- [T3 Env](https://github.com/t3-oss/t3-env)
- [Kobalte Solid 2 Dialog work](https://github.com/kobaltedev/kobalte/pull/694)
- [Phosphor Icons](https://phosphoricons.com/)
- [unplugin-icons](https://github.com/unplugin/unplugin-icons)
- [Effect architecture decision](https://github.com/darjss/tranzfer-v2/issues/7)
- [Effect 4 source and release status](https://github.com/Effect-TS/effect)
- [Effect TSGo Oxlint docs](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md)
- [effect-cf](https://github.com/danieljvdm/effect-cf)
- [Distilled AWS / S3](https://github.com/alchemy-run/distilled)
- [Drizzle v1.0.0-rc.4](https://github.com/drizzle-team/drizzle-orm/releases/tag/v1.0.0-rc.4)
- [Drizzle Effect Postgres docs](https://orm.drizzle.team/docs/connect-effect-postgres)
- [drizzle-kit d1-http migrate bug](https://github.com/drizzle-team/drizzle-orm/issues/5952)
- [Solid integration example dependencies](https://github.com/solidjs/solid/blob/next/examples/effect/package.json)
- [Local Effect decision notes](../research/effect-decision.md)

Research date: 2026-09-14. Verify published versions and open PR status again at
implementation time. Installed package documentation takes precedence over
examples from other repositories.

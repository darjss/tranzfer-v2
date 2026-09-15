# Tooling and UI readiness before uploads

Status: in progress. Step 1 (lint policy) and step 2 (T3 Env) are done. This document authorizes no
implementation by itself beyond the step being executed. Complete this phase
before starting the first transfer flow in step 6 of
[01-foundation.md](01-foundation.md).

The agreed scope is environment validation, stricter linting, verification and
deployment through GitHub Actions, the remaining agreed stack dependencies, and
basic UI components styled to match the home page. Read [STACK.md](../STACK.md)
for package ownership and [RELIABILITY.md](../RELIABILITY.md) before transfer work.

## Architecture decision

Adopt Effect 4 as the application programming model, with Effect RPC as the
primary first-party application boundary and Effect Schema for runtime schemas.
The user selected this direction in [issue #7](https://github.com/darjss/tranzfer-v2/issues/7).
Do not build a comparative spike or reopen the architecture choice during this
phase. Verify integrations while implementing the selected architecture.

STACK.md records this target architecture. The current manifests still contain
the conventional application libraries pending implementation.

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
- Replace Elysia/Eden, Better Result, and Valibot with the selected Effect
  facilities. Remove replaced packages rather than retaining parallel models.
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

Implement the Effect/RPC foundation before environment/schema integration and
deployment verification below. Serve it through effect-cf on the API Worker.
Establish the typed web-to-Worker connection using existing non-upload
behavior. Verify success, schema rejection, typed expected failure, and a
client-aborted first request that does not hang the isolate. Keep future
upload operations out of this phase. Replacing the architecture is complete
only when the old application libraries are removed and checks/builds pass.

## 1. Establish one lint policy

Status: done. Root `vp lint` / `vp fmt --check` pass. `vp -C apps/web lint`
uses the same `lint.config.ts`. Temporary probes failed on chained type
assertions (anti-slop), `solid/reactivity`, and `effecttsgo/floating-effect`.

The lint stack is locked:

- Keep Vite+, Oxlint, Oxfmt, and pnpm.
- Extend `ultracite/oxlint/core`, then `ultracite/oxlint/anti-slop`.
- Apply `eslint-plugin-solid/configs/v2-strict` to web application code,
  preserving its `settings.solid.version` value of 2.
- Keep type-aware linting. Treat Solid reactivity diagnostics as errors.
- Use Ultracite's bundled anti-slop plugin. Do not maintain a second vendored
  copy or add Antfu, nkzw, ESLint, or Biome alongside it.

Verify the chosen published Ultracite release contains the anti-slop export and
loads with the installed Vite+/Oxlint versions. Add packages through pnpm and pin
the selected versions. Share the policy between root and app commands rather
than maintaining divergent rule lists in the existing configs.

Keep core promise and unsafe-type checks. Preserve the anti-slop preset's
conflict resolutions and its `allowInTypeGuards` behavior. Prefer Effect Schema parsing
at external boundaries. Do not replace honest boundary types with casts merely
to satisfy lint. Any necessary exception must name the rule and explain the
specific boundary; do not preemptively disable whole rule groups.

Allow namespace imports used by Effect. Keep React-specific rules out of Solid
code. Lint `apps/web/src/ui` along with the rest of the app. Exclude generated
outputs by exact purpose, not broad UI or declaration-file exclusions. Keep
formatting under Oxfmt.

Effect lint comes from the official `@effect/tsgo` Oxlint plugin (`effecttsgo`),
documented in [Effect-TS/tsgo](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md)
and authored with the language-service diagnostics (Mattia Manzati). Enable
type-aware Oxlint. Extend only `correctness` and `antipattern` presets, scoped
to Effect application packages (`apps/api`, later `packages/contracts` and
`packages/db`). Treat these as errors: `floating-effect`,
`floating-effect-in-vitest`, `missing-effect-context`, `missing-effect-error`,
`missing-layer-context`, `missing-star-in-yield-effect-gen`,
`return-effect-in-gen`, `run-effect-inside-effect`, `try-catch-in-effect-gen`,
`global-error-in-effect-catch`, `unknown-in-effect-catch`, `outdated-api`.

Do not extend the full `recommended` or `effect-native` presets. Those warn on
`global-fetch`, `global-date`, `process-env`, and `async-function` and will
fight Solid, Uppy, T3 Env, and Worker bindings. Do not add
`@effect/eslint-plugin` (dprint plus barrel imports only) or community Oxlint
packs (`cevr/effect-oxlint`, `@mpsuesser/oxlint-plugin-effect`, `effect-rules`).
Do not add ESLint for Effect.

`effect-tsgo patch --oxlint` must match the Vite+/Oxlint/`oxlint-tsgolint`
versions `@effect/tsgo` supports. If the patch fights Vite+, keep the same
diagnostics in `@effect/language-service` for the editor and fail CI with
`effect-tsgo diagnostics` until Oxlint can load the plugin. Duplicate LSP plus
Oxlint diagnostics is not acceptable; turn language-service `diagnostics` off
when Oxlint owns them.

Complete when root and web commands enforce the same applicable rules, lint and
format checks pass without editing files, and direct stdin checks demonstrate
that a representative anti-slop violation, Solid v2 violation, and Effect
correctness violation fail. Do not create test files just to assert
configuration contents.

## 2. Validate environment configuration with T3 Env

Status: done. `@t3-oss/env-core` 0.13.11 plus Effect Schema Standard Schema
maps. Web `env.ts` is the Solid plugin schema and T3 `createEnv` over
`process.env`. The API Worker has no string secrets yet, so T3 runs an empty
server schema and D1/R2 stay binding types. Valibot is removed from both apps.
No production secrets are required to build the landing page.

Use `@t3-oss/env-core` with Effect Schema through its supported Standard Schema
integration. Verify compatibility with the pinned releases rather than retaining
Valibot or adding a custom schema framework. Separate public build-time
values, Worker runtime secrets, and deployment configuration. Explicitly map
the values each environment owns. Validate required configuration before the
operation that needs it, with useful errors that do not print secrets.

Inspect the Solid plugin's existing `env.ts` and `virtual:env/*` integration
before replacing it. Choose one authoritative schema per value. Avoid parallel
validation systems and avoid requiring production credentials for a public
landing-page build. Validate actual configuration, not placeholder future keys.

Keep D1, R2, and service-binding objects typed separately from string environment
variables. Restrict direct configuration reads to their owning env modules,
with narrow exceptions for build-tool configuration where necessary. Update
environment examples and deployment documentation without including secrets.

Complete when valid local/build/runtime configurations work, missing and invalid
required values fail at the intended boundary, and client output contains no
server secrets. Verify these cases directly without adding test files.

## 3. Add GitHub Actions verification

Status: in progress. The first workflow runs `vp check` on pull requests only.
Browser/runtime smoke checks, test runs, schema-rejection probes, and
failure-injection verification are deferred by user decision until core product
functionality lands.

Run verification on pull requests. Use the pinned package
manager, a compatible pinned Node version, and frozen lockfile installation.
Cache dependency downloads, not successful validation results. Keep the same
commands runnable locally.

Required checks cover:

- Formatting without autofix and the complete lint policy.
- Type checking web, API, infrastructure, and the shared RPC contracts with
  their server and client consumers, including generated framework declarations
  needed by a clean checkout. Do not assume a root lint command proves every
  TypeScript project was checked.
- Production builds of both apps, including web prerendering and Worker bundling.
- Existing tests when present. The research snapshot has test setup but no
  matching test files; an empty run must not be reported as test coverage.
- Direct browser/runtime smoke checks for the landing page, hydration, assets,
  and the web-to-API connection. Keep production credentials out of PR jobs.

Use minimal workflow permissions, immutable action revisions, job timeouts,
failure logs, and cancellation of superseded PR verification. Expose a stable
required verification result so adding jobs cannot accidentally bypass merge
requirements. Configure branch protection when implementation scope and account
permissions allow it; report any remaining account-side setup explicitly.

Complete when a clean checkout passes the required check on a pull request.
New test/spec files and test-only helpers still require explicit user approval
under AGENTS.md.

## 4. Add deployments after verification

Status: in progress. The stack now uses `Cloudflare.state()` — the hosted
Alchemy state store provisioned by `alchemy provider cloudflare bootstrap`
(worker `alchemy-state-store` on the account, credentials in Secrets Store).
`vp run plan|deploy|destroy` are pinned to `--stage production` so stage no
longer depends on `$USER`. `alchemy dev` keeps the per-user `dev_$USER` stage.
Local state was backed up before the switch. Because D1/R2 physical names are
stage-derived, the `production` stage created fresh `tranzfer-App-production-*`
and `tranzfer-files-production-*` resources; the previous `live_darjs` storage
held no app data (empty D1, probe-only R2 usage) and remains as orphaned
resources pending deletion. Workers `tranzfer-api`/`tranzfer-web` were adopted
by name. CI auth uses the `ALCHEMY_HOME` secret on the `production` GitHub
environment (a tarball of `~/.alchemy` config, profile, and OAuth credentials),
materialized by the deploy workflow — no Cloudflare API token is needed.
`CLOUDFLARE_ACCOUNT_ID` is a repo variable.

Use `infra/alchemy.run.ts` as the only production stack. Deploy web and API
together after verification succeeds for the same commit on `main`. Support a
manual retry that cannot bypass verification or deploy an arbitrary branch.
Serialize production deployments without cancelling a running apply. Cancel
stale verification work separately.

Before enabling CI deploys, replace local-only Alchemy state with a supported
shared backend for the installed Alchemy v2 release. Local production deploys
and GitHub Actions must use the same stack identity, stage, and state. Back up
and migrate existing state without recreating D1, R2, or Workers. Do not copy
the Alchemy v1 API from vit-store's deploy PR or use Actions cache as state storage.

Build and review `pnpm plan` before applying. Preserve resource names and inspect
any proposed deletion or replacement before proceeding. Keep local deploys in
the main checkout. Use GitHub's production environment for deployment secrets;
never expose them to untrusted PR code or print them in logs.

Check the deployed landing page and API health afterward. Inspect existing
`/infra` probes before automation because they perform storage writes. Keep
destructive or privileged probes out of public health checks. Record the commit
deployed and the manual recovery procedure. Do not claim a Worker rollback also
rolls back database or infrastructure changes.

Manual recovery: deploy from the main checkout with `vp run deploy`. If remote
state is lost, `alchemy provider cloudflare bootstrap` reprovisions the store
and `deploy --adopt` re-imports existing resources. If the `ALCHEMY_HOME` OAuth
credential expires or is revoked, refresh it by re-uploading a fresh tarball of
`~/.alchemy` to the `production` environment secret.

Complete when the shared-state migration preserves existing resources and a
verified commit deploys through Actions with passing post-deploy checks.

## 5. Reconcile and install the agreed stack

First reconcile STACK.md with the architecture decision above, including package
ownership, RPC contracts, error handling, schema validation, and HTTP exceptions.
Then compare every remaining affirmative dependency choice against package
manifests and current compatibility. Install the missing agreed dependencies
upfront in their owning package. The document's optional examples and explicit
exclusions are not an installation list. Do not add empty packages, wrappers, or
future desktop dependencies just to house installed libraries.

Install and pin, in their owning packages:

- `effect` and related packages at the same 4.x RC as infra (`4.0.0-rc.112`
  when researched; bump together with Alchemy).
- `effect-cf` for the Worker fetch runtime. Peer Effect RC must match.
- `@distilled.cloud/aws` for S3/R2. Provide `FetchHttpClient`, `Region`,
  `Endpoint`, and `Credentials` Layers. Prove ListParts and a presigned
  UploadPart URL against real R2 before treating signing as done. If Distilled
  path-style URLs fail R2, keep Distilled for ListParts and sign with
  `aws4fetch`.
- `drizzle-orm@1.0.0-rc.4` (npm tag `rc`) and matching `drizzle-kit@rc`, plus
  `@effect/sql-d1` at the pinned Effect RC. Use `drizzle-orm/effect-d1`
  (`SQLiteD1Drizzle.make` / `makeWithDefaults`). Official Effect docs are
  Postgres-first; D1 Effect support landed in rc.4 as `effect-d1`. Do not stay
  on `drizzle-orm@0.45.2`.
- `drizzle-kit` `d1-http` migrate on rc.4 is reported broken for non-empty
  journals ([issue 5952](https://github.com/drizzle-team/drizzle-orm/issues/5952)).
  Apply migrations through a path that works on this stack (Wrangler/Alchemy
  local execute, or a kit release that fixes `/raw` rows). Do not claim D1
  readiness on an empty-database-only migrate.
- `unplugin-icons` and `@iconify-json/ph` in `apps/web` for Phosphor Bold
  chrome icons. Do not install Lucide, Tabler, or `solid-icons`. Keep brand
  and notebook SVGs custom. Prove a Solid 2 import and `currentColor` render
  before treating the set as ready.

Pin compatible Effect 4 objects inside the Worker. Do not pass Alchemy's
Effect values into application Layers.

Resolve these known discrepancies before claiming readiness:

- Kobalte publishes `2.0.0-alpha.2` with exact Solid rc.3 peers; this app uses
  rc.8. Check current releases and relevant fixes, then prove compatibility.
  Do not suppress peer warnings and call the integration complete.
- TanStack Solid Form is absent from the manifest although STACK.md says it is
  installed. Its researched store dependency requires Solid 1. Resolve the
  adapter compatibility and Effect Schema validation integration before
  installing and using it.
- Several Solid Primitives are installed despite the document saying none are.

If a compatible maintained release does not exist, present the concrete options
to the user before choosing a fork, replacement, or scope change. Update STACK.md
to reflect the actual selected versions and remaining blockers.

Complete when agreed packages install together, their required integrations run
under the pinned Solid and Worker runtimes, and the stack document matches the
manifests. An unresolved compatibility blocker keeps this step incomplete.

## 6. Prepare the local UI components

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

## Handoff to core upload

Record the commands and deployed URLs that passed, the exact component set,
configuration ownership, and any unresolved blockers. Start the transfer flow
only after this phase's gates pass. Preserve the original reliability requirements
for resume, finalization, authorized downloads, cancellation, and expiration.

Implementation must leave the user's existing changes in
`apps/web/file-routes.d.ts` and `apps/web/solid-env.d.ts` untouched. Do not stage
or commit those changes as part of this work.

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

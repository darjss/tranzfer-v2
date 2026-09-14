# Tooling and UI readiness before uploads

Status: planned. This document authorizes no implementation by itself. Complete
this phase before starting the first transfer flow in step 6 of
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

This decision supersedes STACK.md's conventional application-stack choices until
that document is reconciled during implementation.

- Keep Solid 2 for UI/reactivity and Uppy for browser multipart transport.
- Use Effect for application workflows, typed expected failures, dependency
  management, bounded concurrency, retries, resource lifetimes, and tracing.
- Define RPC input, success, and expected-error schemas once in shared contracts.
  Derive server handlers and client types from those contracts and validate data
  at the network boundary. Do not duplicate DTOs or cast responses into types.
- Use HTTP endpoints for Better Auth, Polar webhooks, health checks, and browser
  download links. Retain Better Auth, Drizzle + D1, R2, and Alchemy.
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
deployment verification below. Establish the typed web-to-Worker connection
using existing non-upload behavior. Verify success, schema rejection, and typed
expected failure under the actual Worker runtime. Keep future upload operations
out of this phase. Replacing the architecture is complete only when the old
application libraries are removed and checks/builds pass.

## 1. Establish one lint policy

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
code. Apply any additional Effect-specific rules only to Effect code and verify
that they match the pinned Effect 4 APIs. Lint `apps/web/src/ui` along with
the rest of the app. Exclude generated outputs by exact purpose, not broad UI
or declaration-file exclusions. Keep formatting under Oxfmt.

Complete when root and web commands enforce the same applicable rules, lint and
format checks pass without editing files, and direct stdin checks demonstrate
that a representative anti-slop violation and Solid v2 violation fail. Do not
create test files just to assert configuration contents.

## 2. Validate environment configuration with T3 Env

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

Run verification on pull requests and pushes to `main`. Use the pinned package
manager, a compatible pinned Node version, and frozen lockfile installation.
Cache dependency downloads, not successful validation results. Keep the same
commands runnable locally.

Required checks cover:

- Formatting without autofix and the complete lint policy.
- Type checking web, API, and infrastructure, including generated framework
  declarations needed by a clean checkout. Do not assume a root lint command
  proves every TypeScript project was checked.
- Type checking shared RPC contracts and their server/client consumers. Verify
  that an invalid request and incompatible handler response fail type checking,
  and malformed network input fails runtime schema validation.
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

Complete when a clean checkout passes all required checks and intentional
formatting, lint, and type errors fail the relevant checks. Use stdin or temporary
changes that are removed afterward. New test/spec files and test-only helpers
still require explicit user approval under AGENTS.md.

## 4. Add deployments after verification

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

Resolve these known discrepancies before claiming readiness:

- Kobalte publishes `2.0.0-alpha.2` with exact Solid rc.3 peers; this app uses
  rc.6. Check current releases and relevant fixes, then prove compatibility.
  Do not suppress peer warnings and call the integration complete.
- TanStack Solid Form is absent from the manifest although STACK.md says it is
  installed. Its researched store dependency requires Solid 1. Resolve the
  adapter compatibility and Effect Schema validation integration before
  installing and using it. Do not preserve Valibot solely for forms.
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
headless-component wrappers small and preserve their typed APIs.

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
- [Effect architecture decision](https://github.com/darjss/tranzfer-v2/issues/7)
- [Effect 4 source and release status](https://github.com/Effect-TS/effect)
- [Solid integration example dependencies](https://github.com/solidjs/solid/blob/next/examples/effect/package.json)

Research date: 2026-09-14. Verify published versions and open PR status again at
implementation time. Installed package documentation takes precedence over
examples from other repositories.

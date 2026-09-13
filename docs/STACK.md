# STACK.md

# Tranzfer v2 Stack

This document describes the intentionally small technical stack for Tranzfer v2.

The goal is not to maximize the number of good libraries we use.

The goal is to have **one obvious tool for each job** and a codebase that humans and coding agents can understand without archaeological excavation.

The stack is allowed to contain powerful tools.

It is not allowed to become a museum of interesting tools.

---

# Runtime and workspace

## Package manager

**pnpm**

Use a pnpm workspace with root catalogs for shared dependency versions.

```text
apps/*
infra
packages/*
```

Why:

- mature monorepo behavior
- deterministic installs
- workspace protocol
- dependency catalogs
- already proven in Store Kit
- boring in a good way

Do not introduce Turborepo/Nx unless the repository eventually demonstrates an actual need for them.

The monorepo is small enough that package-manager workspaces are sufficient.

## Local addresses

Use **Portless** for named local URLs. From the repo root:

```text
vp run dev
```

That starts every app `dev` script through Portless without TLS (no port 443 / local CA). Addresses:

```text
http://tranzfer.localhost       apps/web
http://api.tranzfer.localhost   apps/api
```

Portless assigns each app a port and injects it (`PORT`, `--port`, or Wrangler's flags). Do not hard-code `localhost:3000` in docs or scripts.

One `portless.json` at the repo root names the apps. `turbo` is off; this repo does not use Turborepo.

Direct Vite without Portless still works: `vp run --filter @tranzfer/web dev`.

---

# Repository shape

```text
tranzfer/
├── apps/
│   ├── web/
│   ├── api/
│   └── maintenance/
│
├── packages/
│   ├── contracts/
│   ├── db/
│   └── upload-core/
│
├── infra/
│
├── SOUL.md
├── VISION.md
├── STACK.md
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

That is the starting point.

A future desktop client may eventually add:

```text
apps/desktop/
```

but **do not create it before recurring real-world usage justifies it**.

When it exists, it should reuse contracts and transfer behavior instead of importing website implementation code.

Do not create:

```text
packages/common
packages/shared
packages/utils
packages/helpers
packages/core
```

as dumping grounds.

New packages require a real architectural boundary.

---

# Frontend

## Solid 2

**Solid 2** is the application framework.

Pin the exact Solid 2 release used by the repository.

Do not use floating prerelease ranges.

No React compatibility layer.

No React component dependencies.

No Astro.

No SolidStart.

Do not introduce a separate metaframework unless the product eventually proves one is necessary.

The web application is a Solid application.

Solid should be written as Solid rather than React with different syntax.

Use Solid's reactive model directly and keep state close to the feature that owns it.

---

## Vite

Use **Vite** for the web application.

Keep the build setup boring.

The web Worker is the production server. `@cloudflare/vite-plugin` owns the `ssr` Vite environment (`viteEnvironment: { name: "ssr" }`) so `vp dev` / `vp build` / `vp preview` run the Solid `handleRequest` export inside workerd. `src/worker.ts` is the Worker entry: it forwards each request to `virtual:solid-ssr-handler`. There is no Node `server.js`.

Client assets are Workers static assets. HTML, server functions, and the demo `/api/*` filesystem routes go through the Worker (`assets.run_worker_first: true`). Canonical product HTTP still belongs on the Elysia API Worker, not these starter routes.

`SESSION_SECRET` is still a process env var (the Solid env schema reads `process.env` at boot). Locally that is `apps/web/.env` for Vite plus `apps/web/.dev.vars` for workerd. `nodejs_compat` is on so that read works in the Worker.

Do not introduce framework layers just to gain conventions that Tranzfer does not need.

---

## Routing

Use the official **Solid Router 2** line compatible with the pinned Solid 2 release.

The router owns navigation.

It does not own the domain, data layer, or API contract.

---

## Tailwind CSS

Use **Tailwind CSS v4** for styling.

Keep design tokens and global primitives small and deliberate.

Avoid giant component abstraction systems.

Create reusable components when reuse is real.

---

## UI primitives

Prefer native HTML first.

Use **Kobalte 2** selectively for accessibility-heavy interactive primitives where implementing correct behavior ourselves would be stupid.

Good examples:

```text
dialog
popover
tooltip
select
combobox
dropdown menu
tabs
```

Pin the exact Kobalte version.

Wrap unstable headless primitives behind small local UI components so library churn does not spread across the application.

Do not use Kobalte for things that are already trivial HTML:

```text
button
input
card
layout container
```

Do not install a second headless UI ecosystem unless a concrete missing primitive justifies it.

No Corvu for now.

No React UI ecosystem.

Do not reproduce the dependency soup from Tranzfer v1.

---

## Solid Primitives

Use **Solid Primitives** à la carte when a primitive clearly saves real implementation work.

Potentially useful examples include:

```text
connectivity
scheduled
storage
event-listener
resize-observer
virtual
```

Do not install primitives speculatively.

Do not let a utility primitive become the owner of transfer state.

Upload mechanics remain Uppy's responsibility.

---

## Forms

Use **TanStack Form** with **Valibot**.

Forms are generic state machines that we do not need to hand-roll.

TanStack Form owns:

```text
field state
touched / dirty state
validation lifecycle
submit state
form errors
field errors
reset/default values
async validation when needed
```

Valibot owns runtime validation schemas.

Do not build a parallel internal form framework.

Small local field wrappers for consistent labels, descriptions, and errors are fine.

Do not create a giant abstraction layer over TanStack Form.

---

## Remote data

Do **not** add TanStack Query initially.

Use Solid 2's native async/reactive primitives and direct Eden calls.

Tranzfer does not currently need a second client-side cache system with query keys, invalidation policy, garbage collection, and hydration machinery.

If real product behavior later demonstrates a need for advanced shared remote caching, reconsider it then.

---

## Tables

Do **not** add TanStack Table initially.

Render ordinary transfer lists and simple tables directly with Solid.

Introduce a table library only if the product genuinely grows into complex sorting/filtering/resizing/pinning/virtualized table behavior.

---

## dismatch

Use **dismatch** for exhaustive matching of meaningful tagged unions and state machines.

Especially useful for things such as:

```ts
type TransferState =
  | { tag: "idle" }
  | { tag: "preparing" }
  | { tag: "uploading"; progress: Progress }
  | { tag: "paused"; progress: Progress }
  | { tag: "retrying"; attempt: number }
  | { tag: "finalizing" }
  | { tag: "complete"; transferId: string }
  | { tag: "failed"; error: UploadError };
```

Use matching where it makes control flow clearer.

Do not turn every boolean into a tagged union for sport.

---

# Validation and contracts

## Valibot

Use **Valibot** for runtime schemas.

Valibot is the default validation library for:

```text
API request bodies
API responses where runtime validation matters
shared public DTOs
form validation
serialized boundary data
```

Prefer schemas that are portable across web, API, and future desktop clients.

Do not introduce a second schema library without a concrete requirement.

No TypeBox.

---

## packages/contracts

Shared contracts contain only things that genuinely cross boundaries.

Examples:

```text
transfer DTOs
delivery DTOs
device DTOs
billing-plan identifiers
serialized result shapes
public API request/response models
shared domain enums/unions
Valibot schemas used across boundaries
```

`packages/contracts` must not import:

```text
Elysia
Drizzle
Cloudflare bindings
application handlers
UI code
```

Elysia consumes contracts.

Contracts do not know Elysia exists.

Prefer plain TypeScript where runtime validation is unnecessary.

Do not create parallel copies of the same model in web/api/database packages.

Contracts must not import database implementation details.

---

# Upload engine

## Uppy Core

Use:

```text
@uppy/core
@uppy/aws-s3
@uppy/drop-target
```

Uppy owns browser-side upload mechanics.

We own the UI.

Do **not** use Uppy Dashboard as the product UI.

Build the Solid interface ourselves and bridge Uppy events into Solid state.

Do not split upload ownership between Uppy and a second dropzone/file-upload framework.

---

## Direct client → R2

Actual file bytes should normally travel:

```text
Web / future Desktop
        │
        └──────────────→ Cloudflare R2
            signed upload
```

Not:

```text
Client → Worker → R2
```

Workers are the control plane.

R2 is the data plane.

The API authenticates the user, authorizes the operation, owns transfer metadata, and signs storage operations.

The Worker should never proxy hundreds of gigabytes unnecessarily.

---

## Multipart uploads

Large files use R2's S3-compatible multipart API through Uppy.

The upload implementation must support:

- multipart upload creation
- dynamic chunk sizing
- lazy signing
- retries with backoff
- `ListParts`
- resume reconciliation
- multipart completion
- abort
- persisted upload identity
- progress
- throughput
- ETA
- refresh recovery
- network interruption recovery

Chunk sizing must respect the 10,000-part limit.

Do not return to the v1 pattern of hard-coded 25 MB pieces and pre-signing every URL at the beginning.

---

## packages/upload-core

`packages/upload-core` contains transfer behavior that should not care about Solid.

It owns concepts such as:

```text
UploadSession
UploadState
UploadProgress
MultipartPlan
RetryPolicy
UploadError
```

It must not import:

```text
solid-js
Elysia
Drizzle
Cloudflare bindings
UI components
```

Browser-specific behavior belongs in `apps/web`.

The reason this boundary exists is simple:

A future desktop client should be able to reuse the transfer model without importing the website.

Do not invent plugin systems or transport abstractions before they are needed.

---

# API

## Elysia

Use **Elysia** for the canonical HTTP API.

The API runs on a dedicated Cloudflare Worker.

The web application is a client of that API.

Do not mount Tranzfer's canonical domain API inside the Solid web application.

Elysia owns:

- routing
- HTTP validation
- authentication integration
- request/response boundaries
- API composition
- OpenAPI generation

Elysia does **not** own the domain.

Business behavior should remain understandable independently of the HTTP framework.

This is especially important because Cloudflare support is a transport/runtime concern, not something that should infect every package.

Use explicit request and response schemas for meaningful API boundaries.

Do not depend on filesystem-based type-generation features that are incompatible with the Worker runtime.

---

## Eden

Use **Eden Treaty** for first-party TypeScript API clients.

The Elysia application type is the canonical typed HTTP surface for:

```text
web
future desktop app
internal TypeScript tooling
```

Conceptually:

```text
Solid Web ───┐
             ├── Eden ──► Elysia API
Desktop ─────┘
```

Do not introduce a second RPC framework.

Do not add oRPC merely to recreate a contract boundary that Elysia + explicit portable schemas + Eden already provide.

For future non-TypeScript clients, OpenAPI is the interoperability boundary.

---

# Expected errors

## Better Result

Use **better-result** for expected domain failures.

Expected failure is data.

Examples:

```text
TransferExpired
TransferNotFound
UploadAlreadyCompleted
QuotaExceeded
InvalidMultipartState
SubscriptionRequired
PermissionDenied
```

Prefer:

```ts
Result<T, TransferError>;
```

over throwing exceptions for normal business outcomes.

Errors should generally be tagged:

```ts
type TransferError =
  | {
      _tag: "TransferExpired";
      transferId: string;
    }
  | {
      _tag: "QuotaExceeded";
      limit: number;
      requested: number;
    };
```

This combines naturally with `dismatch`.

Use exceptions for genuinely exceptional programmer/runtime failures.

Do not write Java-style try/catch soup.

---

# Database

## Cloudflare D1

Use **Cloudflare D1** for relational application state.

D1 stores metadata.

R2 stores files.

Never store large file payloads in D1.

---

## Drizzle ORM

Use **Drizzle ORM** with D1.

Drizzle owns:

- schema definitions
- migrations
- typed queries
- relational persistence

`packages/db` owns database details.

The rest of the application should not scatter raw SQL and table imports everywhere.

Prefer explicit queries over giant repository abstraction layers.

Do not create `BaseRepository<T>`.

Do not build an ORM on top of the ORM.

---

## IDs

Use standard generated identifiers unless the product demonstrates a reason for something more exotic.

Prefer platform primitives such as:

```ts
crypto.randomUUID();
```

No TypeID dependency.

---

# Authentication

## Better Auth

Use **Better Auth**.

Keep authentication centralized in the API boundary.

Google OAuth is the initial sign-in path.

Authentication and authorization are different concerns.

Better Auth establishes identity.

Tranzfer decides whether that identity can:

```text
create a transfer
view a transfer
manage a workspace
extend retention
access billing
download private content
```

Do not scatter authorization logic through UI components.

---

# Billing

## Polar

Use **Polar** as Merchant of Record.

Polar owns:

- checkout
- subscription billing
- international payment handling
- customer-side sales tax / VAT handling
- subscription lifecycle events

Tranzfer owns:

- entitlement state
- feature access
- plan limits
- reconciliation with Polar webhooks

Initial product tiers:

```text
Free
Pro
Studio
Enterprise
```

The product meaning is roughly:

```text
Free       prove Tranzfer works
Pro        move huge files reliably
Studio     run a recurring production workflow
Enterprise negotiated security/admin/compliance needs
```

Do not encode pricing assumptions deep into business logic.

Use stable internal plan identifiers and map external Polar product IDs through configuration.

Do not turn the pricing model into a matrix of tiny add-ons before customers demand it.

---

# Transfer security and abuse

R2 transfer objects are private.

Download access is mediated by transfer state and authorization.

Initial product constraints:

- Google OAuth through Better Auth
- Turnstile on abuse-sensitive entry points
- production-media / creative-file allowlist
- no archives
- no executables
- validate actual file signatures rather than trusting extensions alone
- short default retention
- download-fanout anomaly detection
- abuse-report path
- admin transfer disable/delete controls

Tranzfer is delivery infrastructure, not public file hosting.

Do not build a giant moderation platform before real abuse requires it.

---

# Cloudflare

Cloudflare is the deployment platform.

Use:

```text
Workers
D1
R2
Queues where materially useful
KV where genuinely appropriate
Cron / scheduled Workers
Service Bindings
Turnstile
```

---

## apps/api

Dedicated Elysia API Worker.

Responsibilities include:

```text
auth
transfer lifecycle
multipart signing
download authorization
deliveries / inbox
billing/webhooks
workspace operations
future device registration
```

The API is a modular monolith.

Do not split auth, transfers, billing, inbox, and devices into separate services just because they could be separate Workers.

---

## apps/maintenance

Small scheduled/queue consumer Worker for asynchronous maintenance.

Examples:

```text
expire transfers
delete expired R2 objects
abort stale multipart uploads
reconcile stale database state
process lightweight asynchronous inspection jobs
```

Do not turn this into a generic job framework.

---

## R2

Use **R2 Standard storage** for transfer payloads.

Files are temporary.

Default product behavior should encourage short retention.

Uploads and downloads should normally bypass Worker compute and communicate directly with R2 using scoped signed operations.

---

## Queues

Use **Cloudflare Queues** when asynchronous work genuinely benefits from decoupling.

Examples may include:

```text
R2 event follow-up
lightweight media inspection
moderation pipeline triggers
cleanup/reconciliation work
notification fanout
```

Do not use Queues merely because event-driven architecture sounds sophisticated.

---

## KV

KV is optional.

Only use it for workloads that fit KV semantics:

```text
short-lived cache
rate-limit metadata
small globally-read configuration
```

Do not use KV as a relational database.

---

# Infrastructure

## Alchemy v2

Use **Alchemy v2** to define Cloudflare infrastructure in TypeScript.

Pin the exact Alchemy v2 version. Current pin: `alchemy@2.0.0-beta.77`.

Alchemy v2's stack file is an Effect program. Effect is installed only in `infra` for that. Application packages do not import Effect.

Until step 4 of the foundation plan wires Workers into Alchemy, `apps/api` uses Wrangler for local `wrangler dev`. That file is a local debug entry, not a second production source of truth.

Alchemy is the authoritative source of Cloudflare infrastructure state.

Infrastructure should include the resources required by the product:

```text
Workers
R2 buckets
D1 databases
Queues
KV namespaces if needed
bindings
service bindings
scheduled triggers
domains
CORS configuration
```

Do not maintain overlapping infrastructure truth in Wrangler configuration.

Wrangler may still be used for:

```text
local debugging
diagnostics
manual inspection
emergency operations
```

but it is not a second infrastructure-management system.

Before applying infrastructure changes:

1. typecheck
2. run the Alchemy plan
3. inspect creates/replacements/deletions
4. do not apply destructive replacements casually

Do not casually rename stable Alchemy resource IDs.

Keep infrastructure readable.

Do not create a generalized internal cloud platform.

---

# Tooling

## TypeScript

Strict TypeScript.

Avoid `any`.

Avoid type gymnastics whose only achievement is impressing TypeScript.

Types exist to make changes safer and behavior easier to understand.

---

## oxlint

Use **oxlint** for linting.

Fast feedback matters heavily in an agent-driven repository.

Lint violations should fail CI.

---

## oxfmt

Use **oxfmt** for formatting.

One formatter.

One format.

No discussions.

---

# Testing

No Playwright initially.

The highest-value tests for Tranzfer are not screenshot tests.

Prioritize:

```text
upload-core state tests
multipart planning tests
retry behavior
result/error serialization
authorization tests
D1 integration tests
Worker/API integration tests
cleanup behavior
upload reconciliation
```

Use Cloudflare's Worker testing environment where real Worker/D1/R2 behavior matters.

The real product also requires **torture testing** that intentionally destroys uploads:

```text
10 GB
100 GB
350 GB

disconnect network
expire signed URL
refresh page
close page
sleep machine
restart router
fail multipart part
resume later
```

Those tests matter more than whether a login button is four pixels too far left.

Browser automation can be introduced later if it begins paying for itself.

---

# Things intentionally not in the stack

Do not add these without a concrete new requirement:

```text
React
Astro
Next.js
SolidStart

TypeBox
TypeID
Playwright

TanStack Query
TanStack Table

Corvu
additional UI ecosystems

oRPC
GraphQL

Redux
Zustand

Kafka
Redis

Turborepo
Nx

Effect

microservices
generic event buses
dependency injection frameworks
internal plugin architectures
```

TanStack Form is intentionally present because forms are a generic state machine we do not want to reimplement.

"No microservices" means:

> Do not decompose the Tranzfer domain into independently owned network services without a demonstrated need.

The web Worker, API Worker, and maintenance/queue consumer are deployment boundaries, not permission to build a service mesh.

This list is not ideological.

It exists because every dependency and abstraction increases the amount of context a human or coding agent has to understand.

The repository should remain small enough to fit inside somebody's head.

---

# The architecture in one picture

```text
                         ┌───────────────────┐
                         │       Polar       │
                         └─────────┬─────────┘
                                   │ webhooks
                                   ▼

┌──────────────┐   Eden   ┌────────────────────┐
│              ├─────────►│                    │
│  Solid 2 Web │          │   Elysia API       │
│              │          │   Worker           │
└──────┬───────┘          │                    │
       │                  ├────────┬───────────┤
       │                  │        │
       │ signed multipart │        ▼
       │                  │       D1
       │                  │
       ▼                  └──────► Better Auth
┌──────────────┐
│      R2      │
│ huge bytes   │
└──────────────┘
        ▲
        │
        │ cleanup / reconciliation / queue work
        │
┌───────┴────────────┐
│ Maintenance Worker│
└────────────────────┘

Future, after validation:

┌──────────────────┐
│ Desktop / Electron│
└────────┬─────────┘
         │ Eden
         ├──────────────► Elysia API Worker
         │
         └─ signed bytes ► R2
```

The most important line in this entire document is:

> **Client → R2 for bytes. The API is the control plane.**

Everything else exists to make that transfer safe, resumable, understandable, and billable.

---

# Installed versions (foundation)

Pins as of the stack-deps change. Bump them on purpose, not by floating ranges.

| Package                                      | Where    | Version       |
| -------------------------------------------- | -------- | ------------- |
| solid-js, @solidjs/web, @solidjs/diagnostics | web      | 2.0.0-rc.6    |
| @solidjs/router                              | web      | 2.0.0-next.21 |
| @solidjs/vite-plugin                         | web      | 3.0.0-next.38 |
| elysia                                       | api      | 1.4.30        |
| @elysiajs/eden                               | web      | 1.4.9         |
| alchemy                                      | infra    | 2.0.0-beta.77 |
| effect                                       | infra    | 4.0.0-rc.115  |
| wrangler                                     | web, api | 4.131.1       |
| @cloudflare/vite-plugin                      | web      | 1.54.8        |
| tailwindcss, @tailwindcss/vite               | web      | 4.3.3         |
| @tanstack/solid-form                         | web      | 1.33.5        |
| @uppy/core                                   | web      | 6.0.1         |
| @uppy/aws-s3                                 | web      | 6.1.0         |
| @uppy/drop-target                            | web      | 5.0.0         |
| dismatch                                     | web      | 2.6.0         |
| better-result                                | web, api | 3.0.1         |
| valibot                                      | web, api | 1.4.2         |
| better-auth                                  | api      | 1.7.4         |
| drizzle-orm                                  | api      | 0.45.2        |
| drizzle-kit                                  | api      | 0.31.10       |
| @polar-sh/sdk                                | api      | 0.49.0        |
| portless                                     | root     | 0.15.6        |

## Departures from the rest of this document

**Kobalte 2 is not installed.** `@kobalte/core` on npm is still 0.13.x (Solid 1). The Solid 2 port is an unreleased PR. Native HTML until a Solid 2 Kobalte ships.

**TanStack Solid Form is installed and unused.** `@tanstack/solid-store@0.11.1` (a dependency of the form package) still wants `solid-js@^1.6.0`. Do not import the form helpers until that peer is Solid 2.

**Better Auth's optional `solid-js@^1` peer is ignored.** Auth stays on the API Worker. We are not using a Solid auth UI adapter.

**Effect exists only in `infra`.** Alchemy v2's stack file is an Effect program. Application code does not import it.

**Solid Primitives were not installed.** The list in this document is still à la carte, not a shopping list.

**No `packages/contracts`, `packages/db`, or `packages/upload-core` yet.** Those folders wait for code that actually has to live there.

---

# Decision rule

When considering a new library, package, abstraction, service, or architectural layer, ask:

> Does this make the next 350 GB transfer more reliable, make the code materially easier to maintain, or help us acquire/serve paying customers?

If the answer is no:

**don't fucking add it.**

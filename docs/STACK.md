# Stack

One tool per job. Versions live in the manifests and the lockfile. Prerelease integrations get checked against installed code, never against memory.

- UI: Solid 2 and Solid Router. Reads go through the [Effect read adapter](SOLID-EFFECT-BINDING.md). No Effect Atom, no query cache.
- Build: Vite+ over a pnpm workspace. The Cloudflare Vite plugin runs SSR in workerd.
- Styling: Panda CSS with `strictTokens`, `css()`/`cva()`/`cx()` from `styled-system`. Bespoke keyframes and reveal hooks stay in plain CSS.
- Components: native elements first. Kobalte for complex accessible widgets, once its Solid 2 support is verified.
- Icons: Phosphor Bold through `unplugin-icons`. The brand and notebook drawings stay custom.
- Forms: native controls. TanStack Form only when a real screen needs it and a Solid 2 adapter works.
- Public config: T3 Env with Effect Schema. Secrets and bindings stay on the server.
- Backend: Effect 4 for workflows, typed errors and services. Pure math stays plain functions.
- Protocol: Effect RPC, schemas in `packages/contracts`. Plain HTTP for Better Auth, webhooks, health and downloads.
- Worker adapter: Alchemy's Effect Worker runtime. Init builds storage, link tokens and auth once per isolate. Domain services are built per request ([STRUCTURE.md](STRUCTURE.md)).
- Database: D1 through Drizzle, wrapped in the `Database` service. Alchemy applies migrations.
- Auth: `@alchemy.run/better-auth` on the Drizzle adapter, over the lazy D1 handle.
- Upload transport: Uppy, straight from the browser to private R2 multipart. A pnpm patch makes its `ListParts` follow pagination.
- Browser recovery metadata: idb-keyval.
- Part hashing for resume verification: hash-wasm MD5.
- Multipart signing: the `Storage` service signs Distilled S3 requests against the R2 endpoint, using a bucket-scoped API token Alchemy mints per stage.
- Billing: Polar through `@distilled.cloud/polar`. The plan catalog is `packages/contracts/src/billing.ts`. The D1 `subscription` row caches Polar's subscription list and is rebuilt from Polar on every webhook and by the sweeper for rows past their period end; no row means Free. A past-due subscription keeps its plan while Polar retries. The staging test login gets a `comp` Studio row that Polar never overwrites. Production bills the live organization, every other stage the sandbox one. Alchemy providers in `infra/polar-provider.ts` create the products (shared by all sandbox stages) and each stage's webhook endpoint (PR #85).
- Infrastructure: Alchemy v2 in `infra/alchemy.run.ts`, on the app's Effect version.
- Local URLs: Portless.
- Lint and format: oxlint with type-aware rules and Solid diagnostics, oxfmt. Rules live in `lint.config.ts`.
- Later, when real work needs it: a maintenance Worker or Queues for cleanup, KV for cache only, Electron with a separate Bun transport process and SQLite for desktop.
- Observability, before launch: PostHog for product analytics, Axiom for the log and trace drain, Sentry for error capture.
- Emitter, executor-validated: Effect spans to `WebTracerProvider` to batch OTLP at `api.axiom.co/v1/traces`. Their solved pitfalls: the browser-platform OTLP exporter build (node build crashes in workerd), lazy per-isolate provider (module-scope I/O fails deploy), Batch not Simple span processor, `waitUntil(forceFlush)`, URL and header redaction on span attrs. Browser spans forward through an edge route with server-held creds; PostHog server-side via direct HTTP, never `posthog-node`; e2e asserts spans against a local OTLP collector. Alchemy ships `@distilled.cloud/axiom`.

Upload, recovery, integrity and abuse rules live in [RELIABILITY.md](RELIABILITY.md). Code placement lives in [STRUCTURE.md](STRUCTURE.md).

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
- Billing: Polar through `@distilled.cloud/polar`. The plan catalog is `packages/contracts/src/billing.ts`. The D1 `subscription` row caches Polar's subscription list and is rebuilt from Polar on every webhook and by the sweeper for rows past their period end; no row means Free. A past-due subscription keeps its plan while Polar retries. The staging test login gets a `comp` Studio row that Polar never overwrites. Production bills the live organization, every other stage the sandbox one. `PAID_PLANS_OPEN` keeps a stage off Polar entirely until billing opens; production waits on it ([PRODUCT.md](PRODUCT.md#when-paid-plans-open)). Alchemy providers in `infra/polar-provider.ts` create the products (shared by all sandbox stages) and each stage's webhook endpoint (PR #85).
- Infrastructure: Alchemy v2 in `infra/alchemy.run.ts`, on the app's Effect version.
- Local URLs: Portless.
- Lint and format: oxlint with type-aware rules and Solid diagnostics, oxfmt. Rules live in `lint.config.ts`.
- Later, when real work needs it: a maintenance Worker or Queues for cleanup, KV for cache only, Electron with a separate Bun transport process and SQLite for desktop.
- Observability, built: Axiom for traces, through Alchemy's `Axiom.Telemetry`, in the `tranzfer-cp1t` org. Production and staging each declare a traces dataset and an ingest-only token in `resources.ts` (`tranzfer-<stage>-traces`, `-ingest`). There is no logs dataset: the free plan allows three datasets, and Effect records each `Effect.log*` line as an event on its span. PR previews reference staging's and export into them, told apart by the `alchemy.stage` resource attribute, so they create and delete nothing in Axiom. `infrastructure/telemetry.ts` provides the telemetry to the API Worker. Alchemy builds the Effect OTLP tracer per request and cron run and flushes them from the request scope with `ctx.waitUntil`, so a request never waits on Axiom. Every `Effect.fn` name is a span, next to Effect's `http.server`, `RpcServer.*` and `sql.execute` spans. Dev stages ship nothing, so `vp run dev` needs no Axiom account. Production and staging deploys need `AXIOM_TOKEN` and `AXIOM_ORG_ID` ([.env.example](../.env.example)); previews need no Axiom credentials, but staging must have deployed first.
- Redaction: Effect records the full URL, query string and every request header on HTTP spans. The tracer wrapper in `telemetry.ts` drops `client.address` and hides `url.query`, `url.full` and every header except content type, content length and `cf-ray`, so an OAuth code, a signature or a cookie never reaches Axiom. Domain attributes are ids, counts and sizes. File names, emails, link tokens and signed URLs stay out.
- Browser spans: `BrowserTracing` in `apps/web/src/api` is Effect's own OTLP tracer over `fetch`, so the OpenTelemetry SDK pitfalls (node exporter build in workerd, batch against simple processors) do not apply. It posts JSON to `/api/telemetry/traces` on the same origin. The web Worker forwards that to the API Worker, which checks the origin, caps the body at 256 KiB, accepts only `application/json`, replaces the service name and forwards to the traces dataset with the ingest token. The browser never holds a credential. RPC calls send `traceparent`, so a click and its API work are one trace. The upload lifecycle is one span per delivery and per file, with events for offline pauses, retries and resume verification; parts get no span.
- Observability, before launch: PostHog for product analytics, server-side over direct HTTP, never `posthog-node`; Sentry for error capture. No e2e test asserts spans against a local OTLP collector yet.

Upload, recovery, integrity and abuse rules live in [RELIABILITY.md](RELIABILITY.md). Code placement lives in [STRUCTURE.md](STRUCTURE.md).

# Stack decisions

Use one tool per responsibility. Package manifests and the lockfile are the source for exact versions. Verify prerelease integrations against installed code before extending them.

## Web

- Solid owns UI state and reactivity. Its router owns navigation. Use native async computations with the [Effect read adapter](SOLID-EFFECT-BINDING.md); add no parallel Effect Atom or query-cache state.
- Vite+ builds the app. The Solid plugin supplies the Worker entry; filesystem routes and web middleware dispatch HTTP routes. Cloudflare's Vite plugin runs SSR in workerd.
- Tailwind owns styling. Use the existing `cva` and `cnfast` utilities for variants. Native elements first; use Kobalte for complex accessible interactions only after verifying Solid compatibility.
- Product icons use Phosphor Bold through `unplugin-icons`. Preserve the landing's custom brand and notebook drawings.
- Add form or table machinery only for a real screen. TanStack Form is the chosen form direction, conditional on a verified Solid adapter. Keep basic controls native.
- Public build configuration uses T3 Env with Effect Schema. Worker secrets and binding objects remain server-side. A landing build must not require production credentials.

## API and storage

- Effect owns backend workflows, typed errors and service dependencies. Pure calculations stay plain functions. Services belong at external boundaries, not around every function.
- Effect RPC is the first-party application protocol. Define input, success and expected-error schemas once in `packages/contracts`. Use HTTP for Better Auth, webhooks, health and browser downloads.
- `effect-cf` owns the API request adapter. Its Cloudflare service-binding RPC is distinct from Effect RPC over HTTP. Do not run a second request runtime beside it.
- D1 stores durable domain metadata. Drizzle's D1 driver is wrapped by the `Drizzle` service. Better Auth shares that connection. Alchemy applies generated migrations.
- Better Auth owns Google sign-in and sessions. Domain operations still check ownership, entitlement and transfer status. Session renewal must reach browser response cookies, including through SSR.
- Uppy owns browser multipart transport. File bytes travel directly between the client and private R2 Standard storage.
- Distilled S3 owns multipart control and signing against the R2 endpoint. Use lazy signed operations, including ListParts. Keep large payloads out of Workers and out of RPC.
- [RELIABILITY.md](RELIABILITY.md) owns durability, recovery, cancellation and integrity rules.

## Infrastructure and later integrations

- `infra/alchemy.run.ts` is the sole infrastructure definition for dev and deploy. Portless supplies local addresses. Preserve stable resource IDs and inspect plans before applying replacements.
- Keep Alchemy's Effect runtime separate from application Effect version selection. Do not pass version-specific Effect objects across incompatible runtimes.
- Keep the API a modular monolith. Add a scheduled maintenance Worker or Queues when cleanup or asynchronous work needs them. KV is optional cache/configuration storage, never durable transfer truth.
- Polar is the billing provider. Keep checkout integration server-side and entitlement state in D1, reconciled from webhooks. External product IDs belong in configuration; pricing stays out of domain logic.
- For future desktop delivery, Electron is the shell and a separate background process owns transport with SQLite recovery metadata. Bun is the initial transport choice, subject to resource and reliability evidence.
- Before public uploads, enforce the creative-media allowlist using file signatures, reject archives and executables, and add appropriate abuse controls. Keep objects private, retention short, and provide reporting and administrative disable/delete paths.

## Tooling

Use Vite+ over the pnpm workspace for installs, checks and builds. Keep type-aware lint and Solid reactivity diagnostics enabled. `lint.config.ts` owns the lint rules; do not copy that configuration into docs or add a competing lint stack.

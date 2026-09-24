# Stack

One tool per job. Versions live in the manifests and the lockfile. Prerelease integrations get checked against installed code, never against memory.

- UI: Solid 2 and Solid Router. Reads go through the [Effect read adapter](SOLID-EFFECT-BINDING.md). No Effect Atom, no query cache.
- Build: Vite+ over a pnpm workspace. The Cloudflare Vite plugin runs SSR in workerd.
- Styling: Tailwind, `cva` for variants, `cnfast` for class merging.
- Components: native elements first. Kobalte for complex accessible widgets, once its Solid 2 support is verified.
- Icons: Phosphor Bold through `unplugin-icons`. The brand and notebook drawings stay custom.
- Forms: native controls. TanStack Form only when a real screen needs it and a Solid 2 adapter works.
- Public config: T3 Env with Effect Schema. Secrets and bindings stay on the server.
- Backend: Effect 4 for workflows, typed errors and services. Pure math stays plain functions.
- Protocol: Effect RPC, schemas in `packages/contracts`. Plain HTTP for Better Auth, webhooks, health and downloads.
- Worker adapter: `effect-cf`. One request runtime.
- Database: D1 through Drizzle, wrapped in the `Drizzle` service. Alchemy applies migrations.
- Auth: Better Auth with Google, sharing the Drizzle connection.
- Upload transport: Uppy, straight from the browser to private R2 multipart.
- Multipart signing: Distilled S3 against the R2 endpoint. Lazy signing, `ListParts` included.
- Billing: Polar. Entitlements live in D1 and get reconciled from webhooks.
- Infrastructure: Alchemy v2 in `infra/alchemy.run.ts`. Its Effect runtime stays separate from the app's.
- Local URLs: Portless.
- Lint and format: oxlint with type-aware rules and Solid diagnostics, oxfmt. Rules live in `lint.config.ts`.
- Later, when real work needs it: a maintenance Worker or Queues for cleanup, KV for cache only, Electron with a separate Bun transport process and SQLite for desktop.

Upload, recovery, integrity and abuse rules live in [RELIABILITY.md](RELIABILITY.md). Code placement lives in [STRUCTURE.md](STRUCTURE.md).

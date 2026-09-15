# Tranzfer

Tranzfer moves enormous files between people who work together.

The first job is simple: a creator should be able to send hundreds of gigabytes of raw footage to an editor without babysitting the transfer or starting over when something breaks.

Wi-Fi will disappear. Laptops will sleep. Tabs will refresh. Signed URLs will expire. Multipart requests will fail halfway through. Tranzfer should recover calmly and continue from the bytes already moved.

That is the product promise:

> Make the next transfer more reliable than the last one.

## Current status

This repository is the clean rewrite of Tranzfer. It currently contains the Solid 2 application foundation and the engineering contracts for the product. The transfer engine is not built yet.

The selected application architecture is Effect 4 with Effect RPC and Effect
Schema for shared, validated client/server contracts. Solid 2 and Uppy retain UI
and multipart transport ownership. The migration from Elysia/Eden, Better Result,
and Valibot is planned, not implemented.

The first real milestone is a 100 GB transfer. The next is a 350 GB transfer that survives deliberate network failures, browser restarts, expired authorization, and interrupted multipart uploads.

## Product rules

- Reliability comes before automation.
- Remote completed parts are the source of truth during recovery.
- A retry must repeat only failed work.
- A lost network pauses a transfer. It does not destroy it.
- Resume must verify the local file before sending another byte.
- Progress must report real completed work.
- Completion and recovery operations must be safe to repeat.
- The software should get quieter as it learns a recurring creator and editor workflow.

Tranzfer is not a generic cloud drive, public file host, project manager, or digital asset manager. Features belong here when they make creator-to-editor delivery more reliable, automatic, or useful enough to pay for.

## Repository documents

- [`docs/SOUL.md`](docs/SOUL.md) explains why Tranzfer exists and how work on it should feel.
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md) defines the transfer and recovery contract.
- [`docs/STACK.md`](docs/STACK.md) records the intended technical stack and its boundaries.
- [`docs/plan/02-pre-upload-readiness.md`](docs/plan/02-pre-upload-readiness.md) tracks the Effect migration, lint policy, CI/deployments, environment validation, and UI preparation before uploads.

## Development

This project uses Solid 2, Vite+, and a pnpm workspace. Apps live under `apps/`. Local URLs come from Portless.

```sh
vp install
vp run dev
```

That serves the web app at `http://tranzfer.localhost` and the API at `http://api.tranzfer.localhost`. One app: `vp run --filter @tranzfer/web dev` or `vp run --filter @tranzfer/api dev`. See `apps/web/.env.example` for public `VITE_` keys. T3 Env plus Effect Schema validate them. There is no required `SESSION_SECRET`.

Before committing code, run:

```sh
vp check
vp run test
```

Deploy Cloudflare resources from this checkout (not a worktree). Use the configured Cloudflare credentials. Plan first, then apply:

```sh
vp run plan
vp run deploy
```

That creates D1, R2, both Workers, the bindings, and attaches `tranzfer.app` to the web Worker. After deploy, `GET /health` on the API URL and `GET /infra` on the web URL (service-binding hop into D1/R2) are the runtime checks. Production web: `https://tranzfer.app`.

The transfer engine is not built yet. Read the repository documents before replacing demo code or making architectural decisions.

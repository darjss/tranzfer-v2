# Tranzfer

Tranzfer moves enormous files between people who work together.

The first job is simple: a creator should be able to send hundreds of gigabytes of raw footage to an editor without babysitting the transfer or starting over when something breaks.

Wi-Fi will disappear. Laptops will sleep. Tabs will refresh. Signed URLs will expire. Multipart requests will fail halfway through. Tranzfer should recover calmly and continue from the bytes already moved.

That is the product promise:

> Make the next transfer more reliable than the last one.

## Current status

This repository is the clean rewrite of Tranzfer. It currently contains the Solid 2 application foundation and the engineering contracts for the product. The transfer engine is not built yet.

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

## Development

This project uses Solid 2, Vite+, and a pnpm workspace. Apps live under `apps/`. Local URLs come from Portless.

```sh
vp install
vp run dev
```

That serves the web app at `http://tranzfer.localhost` and the API at `http://api.tranzfer.localhost`. One app: `pnpm --filter @tranzfer/web dev` or `pnpm --filter @tranzfer/api dev`. Copy `apps/web/.env.example` to `apps/web/.env` and set `SESSION_SECRET` first.

Before committing code, run:

```sh
vp check
vp test
```

The transfer engine is not built yet. Read the repository documents before replacing demo code or making architectural decisions.

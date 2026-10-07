# Tranzfer

Resumable file delivery for creators and editors. The first milestone is one complete upload, recovery and authorized download flow. See the [remaining work](docs/plan/01-foundation.md).

## Development

Install with `vp install`. Put your values in `~/.config/tranzfer/.env.local` and encrypt them with `vp exec varlock encrypt --file ~/.config/tranzfer/.env.local`. [.env.schema](.env.schema) lists every variable, and every checkout and worktree reads that one file. Then follow the [local serving guide](.agents/skills/portless/SKILL.md), then run `vp run dev`.

Use `https://tranzfer.localhost`. Alchemy runs both Workers locally against a real D1 database and R2 bucket for your `dev_<user>` stage, so it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `vp exec varlock load --agent` shows what resolved, with secrets masked. Keep auth secrets server-side and register the matching Google OAuth callback for the chosen origin.

Run `vp check`, `vp run test` and `vp run build` before committing. An empty test run is not passing coverage.

## Deployment

From the main checkout, run `vp run build`, inspect `vp run plan`, then run `vp run deploy`. The production workflow declares its required GitHub secrets in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

After deployment, check API `/health`, web `/infra`, and sign-in. The infrastructure probe checks D1 and R2 reads. A Worker rollback does not roll back migrations or storage changes.

## Decisions

- [Vision](docs/VISION.md) and [product judgment](docs/SOUL.md)
- [Transfer reliability](docs/RELIABILITY.md) and [testing](docs/TESTING.md)
- [Stack](docs/STACK.md) and [code boundaries](docs/STRUCTURE.md)
- [Solid and Effect](docs/SOLID-EFFECT-BINDING.md)

Git and PRs record completed work. Versions and scripts live in package manifests.

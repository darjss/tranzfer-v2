# Tranzfer

Resumable file delivery for creators and editors. The first milestone is one complete upload, recovery and authorized download flow. See the [remaining work](docs/plan/01-foundation.md).

## Development

Install with `vp install`. Copy [.env.example](.env.example) to `.env`, fill in the values, follow the [local serving guide](.agents/skills/portless/SKILL.md), then run `vp run dev`.

Use `https://tranzfer.localhost`. Alchemy owns both Workers and their local D1/R2 bindings. Keep auth secrets server-side and register the matching Google OAuth callback for the chosen origin.

Run `vp check`, `vp run test` and `vp run build` before committing. An empty test run is not passing coverage.

## Deployment

From the main checkout, run `vp run build`, inspect `vp run plan`, then run `vp run deploy`. The production workflow declares its required GitHub secrets in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).

After deployment, check API `/health`, web `/infra`, and sign-in. The infrastructure probe checks D1 and R2 reads. A Worker rollback does not roll back migrations or storage changes.

## Decisions

- [Vision](docs/VISION.md) and [product judgment](docs/SOUL.md)
- [Transfer reliability](docs/RELIABILITY.md)
- [Stack](docs/STACK.md) and [code boundaries](docs/STRUCTURE.md)
- [Solid and Effect](docs/SOLID-EFFECT-BINDING.md)

Git and PRs record completed work. Versions and scripts live in package manifests.

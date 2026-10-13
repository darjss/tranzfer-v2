# Plan 20: Security response headers, and a cross-site check on `/rpc`

> **Executor instructions**: Follow step by step; run each verification; STOP on any STOP condition. No new test files without approval. Work in a worktree off current `origin/dev`. Roll the CSP out report-only first; only the `frame-ancestors` and `nosniff` headers ship enforcing in this plan.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/web/public/_headers apps/web/src/App.tsx apps/web/src/Document.tsx apps/api/src/index.ts 'apps/web/src/routes/d'`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2 | **Effort**: S + S | **Risk**: LOW (headers listed); MED (a full CSP, not in this plan) | **Depends on**: none | **Category**: security
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

1. **No security headers anywhere.** `apps/web/public/_headers` sets only `X-Robots-Tag` and a year-long cache for `/assets/*`; `src/middleware.ts` only mounts the API handler; `Document.tsx` has no CSP meta. Consequences: the signed-in dashboard (cancel a delivery, set or clear a link password) can be framed and clickjacked (no `frame-ancestors`, no `X-Frame-Options`); `/d/<token>` carries the link credential in its path and sets no `Referrer-Policy` (the browser default, `strict-origin-when-cross-origin`, sends only the origin to other sites, so no leak today, but a `no-referrer` makes that independent of browser defaults); no `nosniff`.
2. **`/rpc` relies on `SameSite=Lax` alone.** The web Worker forwards the request untouched (`apps/web/src/routes/rpc.ts:9`) and effect's RPC HTTP handler reads the body as text without checking `Content-Type`. Lax cookies are not sent on cross-site POSTs, so a normal cross-site attacker cannot use it. Sibling hosts are same-site, though: `staging.tranzfer.app` and every `pr-<n>.tranzfer.app` run unmerged branch code, and a request from one of them to `tranzfer.app/rpc` carries the production session cookie. Exploiting it needs a malicious branch from a repo collaborator, so this is cheap defense in depth, not an open hole.

## Current state

`apps/web/public/_headers` (whole file): robots for `https://:sub.tranzfer.app/*` and the `/assets/*` cache rule. Cloudflare Workers static assets apply `_headers` only to files served from the assets binding; Worker-rendered pages set headers in code, as `App.tsx` does for `X-Robots-Tag` (`event.response.headers.set("X-Robots-Tag", "noindex")`, lines ~20-24) and `routes/d/[token].tsx:405-408` does for `cache-control: no-store`.
API: `apps/api/src/index.ts:263-271`:

```ts
HttpRouter.add("POST", "/rpc", perInvocation(
  Effect.flatten(RpcServer.toHttpEffect(Api)).pipe(
    Effect.provide(Layer.mergeAll(ApiHandlers, AuthenticatedLive), { local: true }),
  ),
)),
```

## Commands you will need

| Purpose      | Command                                                                                   | Expected                                    |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| Check        | `vp check`                                                                                | exit 0                                      |
| Tests        | `vp run test`                                                                             | pass                                        |
| Web build    | `vp run --filter @tranzfer/web build`                                                     | exit 0                                      |
| Header check | `curl -sI https://pr-<n>.tranzfer.app/ ; curl -sI https://pr-<n>.tranzfer.app/deliveries` | headers present on static and SSR responses |

## Scope

**In scope**: `apps/web/public/_headers`, `apps/web/src/App.tsx` (the same headers for SSR responses), `apps/web/src/routes/d/[token].tsx` (`Referrer-Policy`), `apps/api/src/index.ts` (the `/rpc` check).
**Out of scope**: an enforcing CSP, HSTS (set at the Cloudflare zone, not in the app), Better Auth's own CSRF handling (`trustedOrigins`).

## Steps

1. `_headers`: add a `/*` block with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`; and `/d/*` with `Referrer-Policy: no-referrer`. Keep the existing two blocks. In `App.tsx`, set the same three headers on SSR responses next to the robots header, and `Referrer-Policy: no-referrer` in `routes/d/[token].tsx` where `cache-control` is set. A shared constant is justified only if both files would otherwise repeat more than three lines; otherwise repeat.
2. Add a report-only CSP as a _separate commit_: `Content-Security-Policy-Report-Only: default-src 'self'; img-src 'self' data: https://*.r2.cloudflarestorage.com; media-src 'self' blob: https://*.r2.cloudflarestorage.com; connect-src 'self' https://*.r2.cloudflarestorage.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Solid hydration injects an inline script (`HydrationScript` in `Document.tsx`), so `script-src` needs a nonce or `'unsafe-inline'` first; run report-only on staging for a week, read the browser console reports, and tighten in a later plan. Do not enforce here.
3. `/rpc` check: before the RPC server runs, reject with 403 when the request has `sec-fetch-site: cross-site` or `same-site`, or has an `origin` header that is not the stage's `APP_URL` origin. Requests without these headers (the e2e client, server-to-server, curl) pass; browsers always send them on `fetch` POST. Implement as a small `Effect` that returns `HttpServerResponse.empty({ status: 403 })` ahead of the existing handler (the `origin` value is already in scope in `index.ts:56`). Use `request.headers["sec-fetch-site"]` as `relayTraces` reads `request.headers.origin`.
4. **Verify**: `vp check`, `vp run test`, web build; then on a PR preview run the header `curl`s above, sign in, use the dashboard (upload, cancel, set password) and confirm no console CSP violation beyond report-only noise and that every RPC still returns 200. From another `*.tranzfer.app` origin (a second preview) confirm `fetch("https://pr-<n>.tranzfer.app/rpc", { method: "POST", credentials: "include", body: "{}" })` is refused with 403.

## Test plan

No new tests. The manual cross-origin check in step 4 is the evidence. If the founder wants it permanent, `e2e/` is the place (one request with `sec-fetch-site: same-site` expecting 403), with approval.

## Done criteria

- [ ] `vp check`, `vp run test`, web build exit 0
- [ ] `curl -sI` shows `x-content-type-options`, `content-security-policy: frame-ancestors 'none'` on `/` and on an SSR route
- [ ] Cross-site and same-site browser POSTs to `/rpc` get 403; same-origin POSTs work
- [ ] The report-only CSP is separate and not enforcing

## STOP conditions

- Any legitimate flow (Google sign-in redirect, Polar checkout redirect, R2 previews, downloads) breaks under the enforcing headers. `frame-ancestors 'none'` blocks only framing of our pages, but confirm no first-party page frames another of ours.
- Browsers or Cloudflare add `sec-fetch-site: same-site` to the web-to-API service-binding hop (it should forward the browser's value; if it rewrites it, STOP and report).

## Maintenance notes

`Referrer-Policy: no-referrer` on `/d/*` means recipient pages send no referrer to R2 downloads; R2 does not need one. HSTS belongs to the zone settings.

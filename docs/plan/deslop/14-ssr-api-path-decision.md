# Plan 14: Decide whether the SSR API client is real; delete it or give it a reader

> **Executor instructions**: This plan starts with a question for the founder. Do step 1, report the answer, and only then continue with the branch chosen. No new test files. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- apps/web/src/api apps/web/src/App.tsx apps/web/vite.config.ts docs/STRUCTURE.md docs/SOLID-EFFECT-BINDING.md`. Changed = compare excerpts; mismatch = STOP.

## Status

- **Priority**: P3 | **Effort**: S | **Risk**: LOW | **Depends on**: none | **Category**: tech-debt (dead code, doc drift)
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

`apps/web/src/api/binding.ts` (68 lines: a workerd-only dynamic import hack, a service-binding fetch, `serverLayer`) and the `isServer ? serverLayer(...) : WebLayer` branch in `App.tsx:32-39` exist so server-rendered pages can read the API with the visitor's cookie. Nothing reads the API on the server any more: the only `runEffect` readers are `routes/deliveries.tsx:124`, `dashboard/deliveries.ts:51,138` and `routes/d/[token].tsx:311`, and both pages are `clientOnly` (`deliveries.tsx:538`, `[token].tsx:400`, whose comment explains that SSR hydration re-ran `OpenLink` and hung the RPC client). `vite.config.ts:85` still sets `renderMode: "async"` with the comment "Session reads can renew cookies; finish them before committing headers", and `docs/STRUCTURE.md:22` and `docs/SOLID-EFFECT-BINDING.md:11` describe the SSR client as live. Two consequences: dead code and docs that tell the next agent something false, and a known-wrong detail nobody notices (the SSR client forwards only the cookie, not `cf-connecting-ip`, so any future SSR read of a rate-limited public RPC would count every visitor under `"unknown"`, `infrastructure/auth.ts:60-61`).

## Current state

`App.tsx:32-39`:

```ts
const api = isServer
  ? serverLayer(
      event?.request.headers.get("cookie") ?? null,
      event?.response.headers ?? new Headers(),
    )
  : WebLayer;
```

`api/binding.ts:41-67` `serverLayer`; `App.tsx:43` `createRuntime(Uploads.layer.pipe(Layer.provideMerge(api)))`.

## Commands you will need

| Purpose   | Command                               | Expected |
| --------- | ------------------------------------- | -------- |
| Check     | `vp check`                            | exit 0   |
| Tests     | `vp run test`                         | pass     |
| Web build | `vp run --filter @tranzfer/web build` | exit 0   |

## Steps

1. **Ask**: "Will any server-rendered page read the API in the next milestone (for example the file-request uploader page, `/r/<token>`, whose link the API already generates at `file-requests.ts` `views`)?" Record the answer.
2. If **no** (recommended; the docs' own rule is no stopgaps): delete `api/binding.ts`; in `App.tsx` provide `WebLayer` only inside `clientOnly` boundaries or keep `WebLayer` for both and ensure it is never _run_ on the server (it is not today); remove `renderMode: "async"` only if build output and the `d/[token]` and `deliveries` pages still render their shells (they do not read on the server); rewrite the two doc paragraphs to say reads happen in the browser. **Verify**: `vp check`, `vp run test`, web build, and open `/deliveries` and a `/d/<token>` page on a PR preview.
3. If **yes**: keep it, forward `cf-connecting-ip` in `serverLayer` (`HttpClientRequest.setHeader(request, "cf-connecting-ip", ...)` from the incoming event), and add one sentence to `docs/SOLID-EFFECT-BINDING.md` naming the page that reads on the server.

## Done criteria

- [ ] Branch 2: `rg -n "serverLayer|api/binding" apps docs` returns nothing; branch 3: the new header is forwarded
- [ ] `vp check`, `vp run test`, web build exit 0
- [ ] Docs match the code

## STOP conditions

- Removing `renderMode: "async"` changes prerendered output or the sitemap (compare `apps/web/dist` file lists before and after).
- The founder answers "yes" but cannot name the page: keep the code and only fix the docs wording.

## Maintenance notes

If server reads come back, they need the client IP header (see branch 3) and a rule for renewed cookies on the response, which `binding.ts:61-66` already implements.

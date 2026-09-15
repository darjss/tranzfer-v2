---
name: portless
description: Start and debug Tranzfer local URLs through Portless. Use when running
  vp run dev, opening tranzfer.localhost, fixing EADDRINUSE, random Vite ports,
  CORS or OAuth redirects, or when a tab is on localhost:3000–3003.
---

# Portless in this repo

Named hosts are the local app. Ports behind the proxy are ephemeral. Installed
docs: `node_modules/portless/README.md`. Pin is `portless@0.15.6`.

## Start

From the repo root:

```text
vp run dev
```

That is `portless` running the single `tranzfer` app in `portless.json`, which
runs `alchemy dev` from `infra/alchemy.run.ts` (stage `dev_$USER`, local workerd
with D1/R2 simulators under `infra/.alchemy/local`, bindings owned by the stack).
The proxy serves TLS. Hosts:

```text
https://tranzfer.localhost       web Worker on :3000
https://api.tranzfer.localhost   api Worker on :8787
```

The api host is a static alias, registered once with `portless alias
api.tranzfer 8787`. `turbo` is false. Do not turn it on.

From an agent shell, start detached so tool timeouts cannot kill it:

```text
pkill -f alchemy/bin/exec; pkill -f "cli.js dev"
setsid -f sh -c 'cd /home/darjs/dev/tranzfer2 && exec vp run dev > /tmp/dev.log 2>&1 < /dev/null'
```

Worker logs live under `infra/.alchemy/log/<stage>/{Api,Web}`.

## Do not

- `vp dev` or `vp run --filter @tranzfer/web dev` as the everyday server. Those
  bind Vite's `server.port` (3000) or the next free 3001–3003. Agents then open
  the wrong tab.
- Hard-code `localhost:3000` in docs, CORS, OAuth, or `.env`.
- `npx` / `dlx` Portless. Use the workspace package.
- `portless trust` for this repo. The proxy already serves TLS; use `curl -k`.
- `--lan`, `--tailscale`, `--ngrok`, or Funnel unless the user asked to share.

## How the proxy works here

Portless picks a free app port (typically 4000–4999), injects `PORT` and Vite
or Wrangler `--port`, and serves the named `.localhost` host on loopback HTTP
(port 80 with `--no-tls`). The browser talks to the name, not the ephemeral
port. HMR websocket goes through the proxy.

`apps/web/vite.config.ts` `server.port: 3000` is only the unproxied fallback.

## Debug

```text
portless list
portless doctor
portless prune
```

`list` shows name → ephemeral port. `doctor` checks proxy, DNS, routes.
`prune` kills orphaned servers from crashed sessions. After a messy agent
session, prune before starting another `vp run dev`.

If the page loops to itself (508), an API proxy must `changeOrigin` and target
`http://api.tranzfer.localhost`, not `localhost:<web-port>`.

Worktrees get a branch subdomain automatically (`http://<branch>.tranzfer.localhost`).
Deploy and Alchemy still run from the main checkout.

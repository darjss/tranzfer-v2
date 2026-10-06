# Code boundaries

Use the existing directory tree as the file inventory. Add a package only for a real boundary, not as a generic home for helpers.

- `packages/contracts` owns the wire API: one file per domain with its schemas, branded ids and tagged errors, plus the RPC group. Errors carry data, not copy; the UI owns the words. It must not import handlers, database code or Worker bindings.
- `packages/db` owns schema, migrations and `Database`: drizzle's Effect driver over D1, with `batch` as the only atomic unit. `@tranzfer/db/testing` gives tests a fresh migrated local D1.
- The top level of `apps/api/src` owns the rules, one domain per file: `Deliveries`, `Transfers`, `SharedLinks` and `Billing` services, the `Storage` port, link tokens and the sweeper. `rpc.ts` is transport only: read the principal, call a service.
- `apps/api/src/infrastructure` owns everything Cloudflare or Alchemy: R2 storage, Better Auth, the stage. Stage checks live here and nowhere else.
- `apps/web/src/routes` owns page and HTTP route entry points. `api` owns clients and the Solid bridge. `ui` owns reused presentation. Keep feature state beside its consumers.
- `infra/alchemy.run.ts` composes the stack. `infra/polar-provider.ts` holds the Alchemy providers for Polar products and webhook endpoints. The API Worker's resources and bindings live in `apps/api/src/resources.ts` and `index.ts`.

## Scope and dependencies

`apps/api/src/index.ts` is the composition edge. Storage, link tokens and Better Auth are built once per isolate; their secrets and binding values stay lazy, because the same init also runs at deploy time with no env. The D1 client belongs to one invocation, so `Database` and the domain services over it are built per request and per cron run, with a fresh memo map.

Database failures are defects (`dieOnDatabaseError` at each service method). Storage failures stay typed as `StorageError` inside the API and become `StorageUnavailable` only where a caller can retry.

`AuthenticatedLive` resolves the incoming cookie and provides `CurrentPrincipal`. A missing session is `Unauthorized`; failure to read it is `AuthenticationUnavailable`. Authentication middleware appends renewed cookies to the HTTP response.

Never capture a request, principal or response headers in an isolate-wide singleton.

Browser RPC posts to exactly `/rpc`, forwarded by the web Worker to the API binding. SSR creates a request-specific client with incoming cookies and outgoing response headers. See [the bridge contract](SOLID-EFFECT-BINDING.md).

## Adding an operation

1. Define its payload, result and expected errors in the domain's contracts file. Add an error only when the client does something different with it.
2. Implement it as a method on the domain service; authorize there, with the sender id the handler passes in.
3. Add a one-line handler in `rpc.ts`.
4. Cover it in `apps/api/test` against the local D1. Transfer changes must also satisfy [RELIABILITY.md](RELIABILITY.md).

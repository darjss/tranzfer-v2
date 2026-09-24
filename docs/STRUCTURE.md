# Code boundaries

Use the existing directory tree as the file inventory. Add a package only for a real boundary, not as a generic home for helpers.

- `packages/contracts` owns shared RPC operations, schemas and expected errors. It must not import application handlers, database implementations or Worker bindings.
- `packages/db` owns schema, migrations and the D1/Drizzle connection. Better Auth and domain queries share that connection.
- `packages/upload-core` is for reusable transfer calculations and recovery data. Keep Solid, Uppy instances and platform I/O out of it.
- `apps/api/src/handlers` translates RPC calls into service operations. `services` owns external dependencies and workflows. Keep queries beside the feature until a real repository boundary is useful.
- `apps/web/src/routes` owns page and HTTP route entry points. `api` owns clients and the Solid bridge. `ui` owns reused presentation. Keep feature state beside its consumers.
- `infra/alchemy.run.ts` composes the stack. The API Worker's resources and bindings live in `apps/api/src/resources.ts` and `index.ts`.

## Scope and dependencies

`apps/api/src/index.ts` is the composition edge: `ApiWorker.make` builds the router, the Better Auth instance and the D1 accessor once per isolate during Worker init. Services can declare their own layer dependencies; `Layer.mergeAll` is not restricted to one file. Capture stable services at layer construction, then read request-specific identity inside the operation.

Configuration is read through `Config` during init — Alchemy binds those reads into the Worker as secrets at deploy. D1 is reached through the lazy `Database` accessor in `packages/db`; nothing may resolve the raw binding during init because the deploy-time evaluation has no env.

`AuthenticatedLive` resolves the incoming cookie and provides `CurrentPrincipal`. A missing session is `Unauthorized`; failure to read it is `AuthenticationUnavailable`. Authentication middleware appends renewed cookies to the HTTP response.

The RPC endpoint builds its authenticated handler layer within the HTTP request scope, because the `Authenticated` middleware requires `HttpServerRequest`. Keep that scope for response hooks and fibers. Never capture a request, principal or response headers in an isolate-wide singleton.

Browser RPC posts to exactly `/rpc`, forwarded by the web Worker to the API binding. SSR creates a request-specific client with incoming cookies and outgoing response headers. The unauthenticated infrastructure client can be shared. See [the bridge contract](SOLID-EFFECT-BINDING.md).

## Adding an operation

1. Define its payload, result and expected errors in contracts.
2. Check authorization in the handler or domain workflow using the current principal.
3. Keep storage failures typed internally. Translate them to a safe public error at the boundary without discarding the server-side diagnostic.
4. Supply dependencies through existing layers. Execute Effects at entry points, not throughout domain code.
5. Verify observable behavior, including failure and request isolation. Transfer changes must also satisfy [RELIABILITY.md](RELIABILITY.md).

Prefer a direct handler over a new service when there is no dependency or workflow to own.

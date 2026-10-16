# Solid and Effect

Read this when changing `apps/web/src/api/solid-effect.ts` or adding an Effect read to a component.

- Provide `RuntimeContext` with `createRuntime(layer)` inside a Solid owner. Missing providers throw. Owner cleanup disposes the runtime.
- Call `runEffect` inside a component or computation. It reads the provider and returns an async iterable that starts one fiber per iterator.
- Return that iterable from `createMemo`. Solid owns pending, value and error state through `Loading` and `Errored`.
- On a superseded or disposed read, Solid closes the iterator. The adapter interrupts the fiber and waits for its finalizers in `return()`. Solid itself does not await that promise, so replacement reads can overlap cleanup.
- A closed iterator cannot publish a stale result. Pure interruption ends iteration; other active-read failures throw into Solid's error boundary.
- Use this adapter for reads. UI disposal must never abort a remote upload. Durable transfer state and explicit cancellation belong to the transfer workflow in [RELIABILITY.md](RELIABILITY.md).
- Reads run in the browser through `WebLayer`, the only API client (lint blocks `effect/rpc/RpcClient` anywhere else). A page that reads mounts with `clientOnly`; the server renders its shell and never runs the runtime (PR #184). A server-side read would need a request-scoped client that forwards the cookie and `cf-connecting-ip` and appends renewed cookies to the response.

There is no generic mutation adapter. Add mutation behavior when a real caller needs it, using the installed Effect and Solid contracts.

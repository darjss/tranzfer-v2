# Solid 2 × Effect binding

How `apps/web` runs Effect programs. Implementation lives in
`apps/web/src/api/solid-effect.ts` — this doc states the rules it must keep.

Adapted from the official `solid/examples/effect` binding to installed versions
(effect `4.0.0-rc.115`, solid-js `2.0.0-rc.8`).
Source: `~/dev/tranzfer2-references/solid2/solid/examples/effect/`.

## Why a protocol adapter, not a state wrapper

Solid 2 computations natively consume `PromiseLike` and `AsyncIterable` values.
A memo that returns one propagates pending to `<Loading>`, failure to
`<Errored>`, and gives stale-while-revalidate through `latest`/`isPending`. That
is exactly Effect's execution model, so the bridge translates protocols rather
than owning state.

The load-bearing piece is cancellation: when a memo re-runs, Solid calls
`it.return()` on the superseded flight's iterator. The bridge turns that into
`Fiber.interrupt` — Effect's structured interruption (finalizers, retries, the
whole tree) composes with Solid's flight semantics with neither side knowing
about the other.

## API contract

- `RuntimeContext` — Solid context carrying the `ManagedRuntime`. Provide at
  root with `createRuntime(WebLayer)`.
- `createRuntime(layer)` — builds a `ManagedRuntime` scoped to the current
  owner; disposed on unmount. Nested providers share the parent's MemoMap, so
  layers common to both runtimes build once and are refcounted by Effect.
- `runEffect(effect)` — runs an Effect as a Solid-consumable `AsyncIterable`.
  If the consuming computation re-runs or disposes before the fiber settles,
  the fiber is interrupted and finalizers run before a new flight starts.
- `effectAction(genFn)` — a Solid `action` written as an Effect saga. Each
  `yield*`-ed Effect is one transaction step on an interruptible fiber; typed
  failures are thrown back into the generator at the `yield*` (so `instanceof`
  narrows `Schema.TaggedError` classes). A superseding invocation interrupts
  the previous flight, waits for its compensation to settle, then starts.
  `action.interrupt()` interrupts the in-flight step and invalidates queued
  invocations; inside the saga it surfaces as `ActionInterruptedError` — catch
  to compensate, rethrow to reject the action.

## Invariants the implementation must keep

- Disposal never aborts remote work — `runEffect`'s `return()` awaits the
  interrupt so finalizers settle before a new flight starts.
- `effectAction` invocations queue on a settle tail; a call superseded while
  queued throws `ActionInterruptedError` without starting.
- Pure interruption is normal completion; a mixed cause (interrupt + finalizer
  defect) must surface — discriminate with `Cause.hasInterruptsOnly`, not
  `hasInterrupts`.
- Failures crossing `AsyncIterable`/`Generator.throw` are thrown — those
  protocols have no error channel. Domain failures inside Effects stay in the
  typed error channel.

## Usage

```tsx
// app root
<RuntimeContext value={createRuntime(WebLayer)}>
  <App />
</RuntimeContext>
```

```tsx
// read — the RPC client is a service, yield* it
const transfers = createMemo(() =>
  runEffect(Effect.flatMap(ApiClient, (api) => api.ListTransfers())),
);
// wrap in <Errored>/<Loading>; a filter signal in the memo's deps re-runs it:
// in-flight fiber interrupted, fresh one forked, `latest` keeps the stale list
```

```ts
// mutation — a saga, cancellable via .interrupt()
const cancelTransfer = effectAction(function* (id: string) {
  const api = yield* ApiClient;
  try {
    return yield* api.CancelTransfer({ id });
  } catch (e) {
    if (e instanceof TransferUnavailable && e.retryable) {
      // compensate or surface a toast via a yielded Effect
    }
    throw e;
  }
});
```

`cancelTransfer(id)` returns a Promise; `cancelTransfer.interrupt()` cancels.
Inside `action`, writes between yields stay in the action's transaction, and
because suspension is `yield*` not `await`, the "await escapes the
transaction" hazard can't be expressed.

## Gotchas

- **Context resolves at the read site.** `runEffect`/`effectAction` call
  `useContext` internally — call them inside a component or computation body,
  never at file scope.
- **The `null`-runtime fallback is only sound for `R = never`.** Without a
  `RuntimeContext` above, effects run on the default runtime and requirements
  blow up at run time. Provide at root.
- **SSR/Worker requests** use the per-isolate pattern in
  `apps/web/src/api/binding.ts` (one `ManagedRuntime` over the `env.API`
  service binding). This binding is for the browser runtime.
- **Testing**: provide a test layer via a lower
  `<RuntimeContext value={createRuntime(TestLayer)}>` — the shared MemoMap
  means common layers aren't rebuilt.

## Diffs from the official example

| Official (older Effect)                          | Installed rc.115                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `YieldWrap` / `yieldWrapGet` from `effect/Utils` | Gone — `Effect` has `[Symbol.iterator]`; `step.value` is the Effect directly                                                                                                                                                                                             |
| `ManagedRuntime.make(layer, parent?.memoMap)`    | `ManagedRuntime.make(layer, { memoMap })` — options object                                                                                                                                                                                                               |
| `Fiber.RuntimeFiber`                             | `Fiber.Fiber`                                                                                                                                                                                                                                                            |
| `Exit.isInterrupted`                             | Gone — `Cause.hasInterruptsOnly(exit.cause)` after an `isSuccess` check (`hasInterrupts` would also swallow a mixed interrupt+defect cause). `Exit.hasInterrupts` exists but is a `self is Failure` guard, which narrows the union to `never` and breaks `.cause` access |

Two more deliberate diffs from the generic sketch: the channels are
`ApiClient`-constrained rather than `any` (`runFork` accepts
`Effect<A, E, ApiClient>` directly, which keeps `no-explicit-any` and the
unsafe-assertion lints honest), and dispose runs as
`Effect.runFork(runtime.disposeEffect)` inside `onCleanup` so no promise
floats.

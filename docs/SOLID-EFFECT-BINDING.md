# Solid 2 × Effect binding

How `apps/web` runs Effect programs. This is the official `solid/examples/effect`
binding adapted to installed versions (effect `4.0.0-rc.115`, solid-js
`2.0.0-rc.8`). ~90 lines, no wrapper types, no tuple conventions.

Source: `~/dev/tranzfer2-references/solid2/solid/examples/effect/`.

## Why this instead of `runSafe` tuples

Solid 2 computations natively consume `PromiseLike` and `AsyncIterable` values.
A memo that returns one propagates pending to `<Loading>`, failure to
`<Errored>`, and gives stale-while-revalidate through `latest`/`isPending`. That
is exactly Effect's execution model, so the bridge is a protocol adapter, not a
state wrapper.

The load-bearing piece is cancellation: when a memo re-runs, Solid calls
`it.return()` on the superseded flight's iterator. Our `return()` calls
`Fiber.interrupt` — Effect's structured interruption (finalizers, retries, the
whole tree) composes with Solid's flight semantics with neither side knowing
about the other.

## The binding

`apps/web/src/api/solid-effect.ts`:

```ts
import { Cause, Effect, Exit, Fiber, Layer, ManagedRuntime } from "effect";
import { action, createContext, onCleanup, useContext } from "solid-js";

/** Solid context carrying the Effect runtime. Provide with
 * `<RuntimeContext value={createRuntime(WebLayer)}>`. The `null` default means
 * a provider-less read falls back to the default runtime — sound only for
 * effects with `R = never`. */
export const RuntimeContext = createContext<ManagedRuntime.ManagedRuntime<any, never> | null>(null);

/** Build a ManagedRuntime from a Layer, scoped to the current owner: the
 * runtime (and every service finalizer in the layer) is disposed when the
 * providing subtree unmounts. Nested providers share the parent's MemoMap, so
 * layers common to both runtimes are built once and refcounted by Effect. */
export function createRuntime<R>(layer: Layer.Layer<R>): ManagedRuntime.ManagedRuntime<R, never> {
  const parent = useContext(RuntimeContext);
  const runtime = ManagedRuntime.make(layer, { memoMap: parent?.memoMap });
  onCleanup(() => void runtime.dispose());
  return runtime;
}

/** Resolve the forking strategy from Solid context. Must be called under an
 * owner — a computation body or component setup. */
function resolveFork(): <A, E>(effect: Effect.Effect<A, E, any>) => Fiber.Fiber<A, E> {
  const runtime = useContext(RuntimeContext);
  return runtime ? (effect) => runtime.runFork(effect) : (Effect.runFork as any);
}

/** Run an Effect as a Solid-consumable async source. Interruptible: if the
 * consuming computation re-runs or disposes before the fiber settles, the
 * fiber is interrupted and finalizers run. */
export function runEffect<A, E, R = never>(effect: Effect.Effect<A, E, R>): AsyncIterable<A> {
  const fork = resolveFork(); // context resolves at the *reading* computation
  return {
    [Symbol.asyncIterator]() {
      const fiber = fork(effect);
      let yielded = false;
      let closed = false;
      const DONE = { done: true, value: undefined } as const;
      return {
        async next(): Promise<IteratorResult<A>> {
          if (yielded || closed) return DONE;
          const exit = await Effect.runPromise(Fiber.await(fiber));
          if (closed) return DONE;
          if (Exit.isSuccess(exit)) {
            yielded = true;
            return { done: false, value: exit.value };
          }
          closed = true;
          if (Exit.isInterrupted(exit)) return DONE;
          throw Cause.squash(exit.cause);
        },
        // Solid calls this when the flight is superseded or the owner
        // disposes — the bridge to Effect interruption.
        async return(): Promise<IteratorResult<A>> {
          if (!yielded && !closed) Effect.runFork(Fiber.interrupt(fiber));
          closed = true;
          return DONE;
        },
      };
    },
  };
}

/** Thrown into the saga when its in-flight step is interrupted (superseding
 * invocation, cancel button). Catch to compensate, rethrow to reject the
 * action and revert optimistic state. */
export class ActionInterruptedError extends Error {
  constructor() {
    super("Action interrupted");
    this.name = "ActionInterruptedError";
  }
}

export interface EffectAction<Args extends unknown[], R> {
  (...args: Args): Promise<R>;
  /** Interrupt the in-flight step's fiber. Surfaces inside the generator as
   * a thrown `ActionInterruptedError` at the `yield*`. */
  interrupt(): void;
}

/** A Solid action written as an Effect saga. Each `yield*`-ed Effect is one
 * transaction step running as an interruptible fiber; typed failures are
 * thrown back into the generator at the `yield*` (so `instanceof` narrows
 * `Schema.TaggedError` classes). A superseding invocation interrupts the
 * previous one's in-flight fiber before starting.
 *
 * In v4 `Effect` implements `[Symbol.iterator]` itself — `yield* effect`
 * emits the Effect as the step value, no YieldWrap. */
export function effectAction<Args extends unknown[], R>(
  genFn: (...args: Args) => Generator<Effect.Effect<any, any, any>, R, any>,
): EffectAction<Args, R> {
  const fork = resolveFork(); // context resolves where the action is created
  let inFlight: Fiber.Fiber<any, any> | null = null;

  const base = action(function* (...args: Args) {
    const it = genFn(...args);
    let step = it.next();
    while (!step.done) {
      const fiber = fork(step.value);
      inFlight = fiber;
      const exit: Exit.Exit<any, any> = yield Effect.runPromise(Fiber.await(fiber));
      if (inFlight === fiber) inFlight = null;
      if (Exit.isSuccess(exit)) step = it.next(exit.value);
      else if (Exit.isInterrupted(exit)) step = it.throw(new ActionInterruptedError());
      else step = it.throw(Cause.squash(exit.cause));
    }
    return step.value;
  });

  const invoke = (...args: Args) => {
    invoke.interrupt(); // superseding call cancels the previous flight
    return base(...args);
  };
  invoke.interrupt = () => {
    const fiber = inFlight;
    inFlight = null;
    if (fiber) Effect.runFork(Fiber.interrupt(fiber));
  };
  return invoke;
}
```

## Wiring

The RPC client is a service in the web layer, so every `runEffect` read can
`yield*` it — same DI story as the server side.

```ts
// apps/web/src/api/client.ts
import { Context, Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import { Api } from "@tranzfer/contracts";

export class ApiClient extends Context.Service<ApiClient /* client type */>()(
  "tranzfer/ApiClient",
) {
  static layer = Layer.effect(this, RpcClient.make(Api));
}

export const WebLayer = ApiClient.layer.pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
      Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
    ),
  ),
);
```

```tsx
// app root
<RuntimeContext value={createRuntime(WebLayer)}>
  <App />
</RuntimeContext>
```

## Reads

```tsx
// features/transfers/TransferList.tsx
export function TransferList() {
  const transfers = createMemo(() =>
    runEffect(Effect.flatMap(ApiClient, (api) => api.ListTransfers())),
  );
  return (
    <Errored fallback={(err, reset) => <button onClick={reset}>Retry: {String(err())}</button>}>
      <Loading fallback={<Spinner />}>
        <For each={transfers()} keyed={(t) => t.id}>
          {(t) => <TransferRow transfer={t()} />}
        </For>
      </Loading>
    </Errored>
  );
}
```

A filter signal in the memo's deps re-runs it: the in-flight fiber is
interrupted, a fresh one forks, `latest` keeps showing the stale list until
the new one lands. No abort code anywhere.

## Mutations

```ts
const cancelTransfer = effectAction(function* (id: string) {
  const api = yield* ApiClient;
  try {
    return yield* api.CancelTransfer({ id });
  } catch (e) {
    if (e instanceof TransferUnavailable && e.retryable) {
      // decide, maybe surface a toast via a yielded Effect
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
- **The `null`-runtime fallback is only sound for `R = never`.** If an effect
  needs services and there's no `RuntimeContext` above it, it runs on the
  default runtime and the requirements blow up at run time. Provide at root.
- **SSR/Worker requests** keep the existing per-request-runtime pattern from
  `apps/web/src/api.ts` (one ManagedRuntime per isolate over the `env.API`
  binding). This binding is for the browser runtime.
- **Testing**: provide a test layer via a lower `<RuntimeContext
value={createRuntime(TestLayer)}>` — the nested MemoMap share means common
  layers aren't rebuilt.

## Diffs from the official example

| Official (older Effect)                          | Installed rc.115                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `YieldWrap` / `yieldWrapGet` from `effect/Utils` | Gone — `Effect` has `[Symbol.iterator]`; `step.value` is the Effect directly |
| `ManagedRuntime.make(layer, parent?.memoMap)`    | `ManagedRuntime.make(layer, { memoMap })` — options object                   |
| `Fiber.RuntimeFiber`                             | `Fiber.Fiber`                                                                |

Everything else (`Fiber.await`, `Fiber.interrupt`, `Exit.isSuccess`,
`Exit.isInterrupted`, `Cause.squash`, `Effect.runFork`, `runtime.runFork`,
`runtime.dispose`) verified present in rc.115. Solid side (`action`,
`createContext`, `useContext`, `onCleanup`, `<Loading>`, `<Errored>`,
`latest`, `isPending`, `NotReadyError`, `AsyncIterable` in `createMemo`)
verified present in solid-js `2.0.0-rc.8`.

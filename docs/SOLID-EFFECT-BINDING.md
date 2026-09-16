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
import type { Layer } from "effect";
import { Cause, Effect, Exit, Fiber, ManagedRuntime } from "effect";
import { action, createContext, onCleanup, useContext } from "solid-js";

import type { ApiClient } from "./client";

/** Solid context carrying the Effect runtime. Provide with
 * `<RuntimeContext value={createRuntime(WebLayer)}>`. The `null` default means
 * a provider-less read falls back to the default runtime, which is sound only
 * for effects with `R = never`. */
export const RuntimeContext = createContext<ManagedRuntime.ManagedRuntime<ApiClient, never> | null>(
  null,
);

/** Build a ManagedRuntime from a Layer, scoped to the current owner: the
 * runtime (and every service finalizer in the layer) is disposed when the
 * providing subtree unmounts. Nested providers share the parent's MemoMap, so
 * layers common to both runtimes are built once and refcounted by Effect. */
export const createRuntime = <R>(
  layer: Layer.Layer<R>,
): ManagedRuntime.ManagedRuntime<R, never> => {
  const parent = useContext(RuntimeContext);
  const runtime = ManagedRuntime.make(layer, { memoMap: parent?.memoMap });
  onCleanup(() => {
    Effect.runFork(runtime.disposeEffect);
  });
  return runtime;
};

/** Resolve the forking strategy from Solid context. Must be called under an
 * owner — a computation body or component setup. Without a provider the
 * default runtime is used, which is sound only for effects with `R = never`. */
const resolveFork = () => {
  const runtime = useContext(RuntimeContext);
  // SAFETY: a provider-less read can only run `R = never` effects. The
  // context contract above documents the fallback as sound only for those,
  // so the declared requirement channel is erased here.
  return <A, E>(effect: Effect.Effect<A, E, ApiClient>): Fiber.Fiber<A, E> =>
    runtime === null || runtime === undefined
      ? Effect.runFork(effect as Effect.Effect<A, E>)
      : runtime.runFork(effect);
};

/** Run an Effect as a Solid-consumable async source. Interruptible: if the
 * consuming computation re-runs or disposes before the fiber settles, the
 * fiber is interrupted and finalizers run. */
export const runEffect = <A, E>(effect: Effect.Effect<A, E, ApiClient>): AsyncIterable<A> => {
  // context resolves at the *reading* computation
  const fork = resolveFork();
  return {
    [Symbol.asyncIterator]() {
      const fiber = fork(effect);
      let yielded = false;
      let closed = false;
      const DONE = { done: true, value: undefined } as const;
      return {
        async next(): Promise<IteratorResult<A>> {
          if (yielded || closed) {
            return DONE;
          }
          const exit = await Effect.runPromise(Fiber.await(fiber));
          if (closed) {
            return DONE;
          }
          if (Exit.isSuccess(exit)) {
            yielded = true;
            return { done: false, value: exit.value };
          }
          closed = true;
          // interruption means Solid closed the iterator — that is normal
          // completion here, not a failure to surface
          if (Cause.hasInterrupts(exit.cause)) {
            return DONE;
          }
          throw Cause.squash(exit.cause);
        },
        async return(): Promise<IteratorResult<A>> {
          // Solid calls this when the flight is superseded or the owner
          // disposes — the bridge to Effect interruption. Awaiting the
          // interrupt lets finalizers settle before a new flight starts.
          if (!yielded && !closed) {
            await Effect.runPromise(Fiber.interrupt(fiber));
          }
          closed = true;
          return DONE;
        },
      };
    },
  };
};

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
  interrupt: () => void;
}

/** A Solid action written as an Effect saga. Each `yield*`-ed Effect is one
 * transaction step running as an interruptible fiber; typed failures are
 * thrown back into the generator at the `yield*` (so `instanceof` narrows
 * `Schema.TaggedError` classes). A superseding invocation interrupts the
 * previous one's in-flight fiber and starts only after that flight has
 * settled, so its compensation cannot overlap the new run.
 *
 * In v4 `Effect` implements `[Symbol.iterator]` itself — `yield* effect`
 * emits the Effect as the step value, no YieldWrap. */
export const effectAction = <Args extends unknown[], R>(
  genFn: (...args: Args) => Generator<Effect.Effect<unknown, unknown, ApiClient>, R, unknown>,
): EffectAction<Args, R> => {
  // context resolves where the action is created
  const fork = resolveFork();
  let inFlight: Fiber.Fiber<unknown, unknown> | null = null;
  // invocations queue: each waits for the previous flight to settle so an
  // interrupted saga's compensation cannot overlap the superseding run, and
  // a call superseded while still queued never starts
  let tail: Promise<unknown> = Promise.resolve();
  let sequence = 0;

  const base = action(function* base(
    ...args: Args
  ): Generator<Promise<Exit.Exit<unknown, unknown>>, R, Exit.Exit<unknown, unknown>> {
    const it = genFn(...args);
    let step = it.next();
    while (step.done !== true) {
      const fiber = fork(step.value);
      inFlight = fiber;
      const exit = yield Effect.runPromise(Fiber.await(fiber));
      if (inFlight === fiber) {
        inFlight = null;
      }
      if (Exit.isSuccess(exit)) {
        step = it.next(exit.value);
      } else if (Cause.hasInterrupts(exit.cause)) {
        step = it.throw(new ActionInterruptedError());
      } else {
        step = it.throw(Cause.squash(exit.cause));
      }
    }
    return step.value;
  });

  const interrupt = () => {
    const fiber = inFlight;
    inFlight = null;
    if (fiber !== null) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
  };

  return Object.assign(
    async (...args: Args) => {
      // superseding call cancels the previous flight, then waits for its
      // compensation to settle before starting
      interrupt();
      sequence += 1;
      const mine = sequence;
      const current = (async () => {
        try {
          await tail;
        } catch {
          // the previous flight's rejection already surfaced to its caller
        }
        if (mine !== sequence) {
          throw new ActionInterruptedError();
        }
        return await base(...args);
      })();
      tail = current;
      return await current;
    },
    { interrupt },
  );
};
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

export class ApiClient extends Context.Service<
  ApiClient,
  RpcClient.FromGroup<Api, RpcClientError>
>()("tranzfer/ApiClient") {
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
- **SSR/Worker requests** keep the per-request-runtime pattern in
  `apps/web/src/api/binding.ts` (one ManagedRuntime per isolate over the
  `env.API` service binding). This binding is for the browser runtime.
- **Testing**: provide a test layer via a lower `<RuntimeContext
value={createRuntime(TestLayer)}>` — the nested MemoMap share means common
  layers aren't rebuilt.

## Diffs from the official example

| Official (older Effect)                          | Installed rc.115                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `YieldWrap` / `yieldWrapGet` from `effect/Utils` | Gone — `Effect` has `[Symbol.iterator]`; `step.value` is the Effect directly                                                                                                                     |
| `ManagedRuntime.make(layer, parent?.memoMap)`    | `ManagedRuntime.make(layer, { memoMap })` — options object                                                                                                                                       |
| `Fiber.RuntimeFiber`                             | `Fiber.Fiber`                                                                                                                                                                                    |
| `Exit.isInterrupted`                             | Gone — `Cause.hasInterrupts(exit.cause)` after an `isSuccess` check. `Exit.hasInterrupts` exists but is a `self is Failure` guard, which narrows the union to `never` and breaks `.cause` access |

Two more deliberate diffs from the generic sketch: the channels are
`ApiClient`-constrained rather than `any` (`runFork` accepts
`Effect<A, E, ApiClient>` directly, which keeps `no-explicit-any` and the
unsafe-assertion lints honest), and `dispose` runs as
`Effect.runFork(runtime.disposeEffect)` inside `onCleanup` so no promise
floats.

Everything else (`Fiber.await`, `Fiber.interrupt`, `Exit.isSuccess`,
`Cause.squash`, `Effect.runFork`, `runtime.runFork`, `runtime.disposeEffect`)
verified present in rc.115. Solid side (`action`, `createContext`,
`useContext`, `onCleanup`, `<Loading>`, `<Errored>`, `latest`, `isPending`,
`NotReadyError`, `AsyncIterable` in `createMemo`) verified present in
solid-js `2.0.0-rc.8`.

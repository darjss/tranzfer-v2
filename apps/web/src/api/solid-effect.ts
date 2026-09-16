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

import type { Layer } from "effect";
import { Cause, Effect, Exit, Fiber, ManagedRuntime } from "effect";
import { createContext, onCleanup, useContext } from "solid-js";

import type { ApiClient } from "./client";

export const RuntimeContext = createContext<ManagedRuntime.ManagedRuntime<ApiClient, never>>();

export const createRuntime = <R>(layer: Layer.Layer<R>) => {
  const runtime = ManagedRuntime.make(layer);
  onCleanup(() => {
    Effect.runFork(runtime.disposeEffect);
  });
  return runtime;
};

/** Run an Effect as a Solid-consumable async source. Interruptible: if the
 * consuming computation re-runs or disposes before the fiber settles, the
 * fiber is interrupted and finalizers run. */
export const runEffect = <A, E>(effect: Effect.Effect<A, E, ApiClient>): AsyncIterable<A> => {
  // context resolves at the *reading* computation
  const runtime = useContext(RuntimeContext);
  return {
    [Symbol.asyncIterator]() {
      const fiber = runtime.runFork(effect);
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
          // a pure-interrupt cause means Solid closed the iterator — normal
          // completion. A mixed cause (interrupt + finalizer defect) must
          // still surface, so this is hasInterruptsOnly, not hasInterrupts
          if (Cause.hasInterruptsOnly(exit.cause)) {
            return DONE;
          }
          throw Cause.squash(exit.cause);
        },
        async return(): Promise<IteratorResult<A>> {
          // Solid does not await return() before starting the replacement read.
          if (!yielded && !closed) {
            closed = true;
            await Effect.runPromise(Fiber.interrupt(fiber));
          }
          closed = true;
          return DONE;
        },
      };
    },
  };
};

import { createEffect } from "solid-js";

/**
 * While `when()` is truthy, calls `tick` with its value every `every` ms, at
 * most `tries` times. A new value restarts the count; `stop` ends it early.
 * Call it in a component or root, which clears the timer when it unmounts.
 */
export const createPoll = <T>(
  when: () => T,
  tick: (value: T, stop: () => void) => void,
  { every, tries = Infinity }: { every: number; tries?: number },
) => {
  createEffect(when, (value) => {
    if (!value) {
      return;
    }
    let count = 0;
    const stop = () => {
      clearInterval(timer);
    };
    const timer = setInterval(() => {
      count += 1;
      if (count > tries) {
        stop();
        return;
      }
      tick(value, stop);
    }, every);
    return stop;
  });
};

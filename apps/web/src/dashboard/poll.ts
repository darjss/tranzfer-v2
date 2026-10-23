import { createEffect } from "solid-js";

/**
 * Calls `tick` every `every` ms while `when()` is truthy, at most `tries`
 * times per stretch. A new value from `when` restarts the count; `stop` ends
 * this stretch early.
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
    const timer = setInterval(() => {
      count += 1;
      if (count > tries) {
        clearInterval(timer);
        return;
      }
      tick(value, () => {
        clearInterval(timer);
      });
    }, every);
    return () => {
      clearInterval(timer);
    };
  });
};

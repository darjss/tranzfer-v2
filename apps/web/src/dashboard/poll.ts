import { createEffect } from "solid-js";

/**
 * Calls tick every `everyMs` while source returns something other than false,
 * at most `tries` times. A new source value restarts the count; tick's stop
 * ends polling early. Unmounting clears the timer.
 */
export const createPoll = <T>(
  source: () => T | false,
  tick: (value: T, stop: () => void) => void,
  { everyMs, tries = Infinity }: { everyMs: number; tries?: number },
) => {
  createEffect(source, (value) => {
    if (value === false) {
      return undefined;
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
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  });
};

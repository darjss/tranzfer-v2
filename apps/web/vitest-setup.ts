// Registers @testing-library/jest-dom's matchers (toHaveTextContent etc.)
// with vitest's expect, including their types.
import "@testing-library/jest-dom/vitest";
// vi.mock only hoists when vi comes from vitest or vite-plus/test, not @effect/vitest.
import { vi } from "vite-plus/test";

// HOT_SCOPE_TIME is a wall-clock budget (8 ms per memo per second) that slow shared CI runners trip at random.
// A setup-level attribution.enable({ hotTime: false }) can't turn it off: false loses when holds merge (demanding() in @solidjs/signals attribution.js).
vi.mock(import("@solidjs/diagnostics"), async (importOriginal) => {
  const diagnostics = await importOriginal();
  return {
    ...diagnostics,
    captureArtifact: (scenario, options = {}) => {
      const { attribution = true } = options;
      if (attribution === false) return diagnostics.captureArtifact(scenario, options);
      return diagnostics.captureArtifact(scenario, {
        ...options,
        attribution: attribution === true ? { hotTime: false } : { hotTime: false, ...attribution },
      });
    },
  };
});

import { afterEach, describe, expect, it } from "@effect/vitest";
import { assertBudget, captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import PriceCalculator from "./PriceCalculator";

afterEach(cleanup);

const price = (name: string) =>
  screen.getByText(name).closest("div")?.parentElement?.lastElementChild?.textContent;

describe("PriceCalculator", () => {
  it("moves every price as the size and count change", async () => {
    render(() => <PriceCalculator />);
    flush();
    // Starts at 4 deliveries of 100 GB: Starter fits, MASV bills 385 GB.
    expect(price("Tranzfer")).toContain("$15");
    expect(price("MASV")).toContain("$96.25");

    const [size, count] = screen.getAllByRole("slider");
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.input(size, { target: { value: "0" } });
        fireEvent.input(count, { target: { value: "1" } });
        await Promise.resolve();
      },
      { scenario: "drag-sliders" },
    );
    flush();

    // One 1 GB delivery: Free everywhere it exists, Filemail's cheapest plan.
    expect(screen.getByText(/^That's 1 GB a month\./u)).toBeInTheDocument();
    expect(price("Tranzfer")).toContain("$0");
    expect(price("MASV")).toContain("$0");
    expect(price("Filemail")).toContain("$6");
    expect(artifact).toHaveNoDiagnostics();
    // Two inputs, each re-running the quotes and the rows that read them.
    assertBudget(artifact, { allow: [], maxReruns: 80, maxWastedRuns: 0 });
  });
});

// PROTOTYPE, throwaway. Floating bar that flips `?variant=` between design
// variants on one route. Dev builds only; never fold this into main.
import { useSearchParams } from "@solidjs/router";
import { onSettled, Show } from "solid-js";
import PhCaretLeftBold from "~icons/ph/caret-left-bold";
import PhCaretRightBold from "~icons/ph/caret-right-bold";

type Variants = readonly (readonly [key: string, name: string])[];

export const useVariant = (variants: Variants) => {
  const [params] = useSearchParams<{ variant: string }>();
  return () => variants.find(([key]) => key === params.variant)?.[0] ?? variants[0][0];
};

export function PrototypeSwitcher(props: { variants: Variants }) {
  const [params, setParams] = useSearchParams<{ variant: string }>();
  const index = () =>
    Math.max(
      0,
      props.variants.findIndex(([key]) => key === params.variant),
    );
  const current = () => props.variants[index()][0];
  const step = (delta: number) => {
    const count = props.variants.length;
    setParams({ variant: props.variants[(index() + delta + count) % count][0] }, { replace: true });
  };

  onSettled(() => {
    const onKey = (event: KeyboardEvent) => {
      const { target } = event;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        step(-1);
      }
      if (event.key === "ArrowRight") {
        step(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  return (
    <Show when={import.meta.env.DEV}>
      <div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#141414]/92 p-1 font-mono text-xs text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,.6)] backdrop-blur-md">
        <button
          class="grid size-8 place-items-center rounded-full hover:bg-white/15"
          onClick={() => {
            step(-1);
          }}
          aria-label="Previous variant"
          type="button"
        >
          <PhCaretLeftBold class="size-3.5" />
        </button>
        <span class="min-w-44 px-2 text-center">
          {current()} · {props.variants[index()]?.[1]}
        </span>
        <button
          class="grid size-8 place-items-center rounded-full hover:bg-white/15"
          onClick={() => {
            step(1);
          }}
          aria-label="Next variant"
          type="button"
        >
          <PhCaretRightBold class="size-3.5" />
        </button>
      </div>
    </Show>
  );
}

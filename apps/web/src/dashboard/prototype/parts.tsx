// PROTOTYPE, throwaway. The few pieces every dashboard variant shares.
import type { Delivery } from "./data";
import { confirmedOf, status, toneBar } from "./data";

// Confirmed work is solid; in-flight parts are a pale tail (RELIABILITY:
// progress reflects confirmed work, in-flight activity shown separately).
export function Progress(props: { d: Delivery; thick?: boolean; class?: string }) {
  const pct = () => (confirmedOf(props.d) / props.d.size) * 100;
  const flight = () => {
    const { stage } = props.d;
    return stage.kind === "uploading" ? (stage.inFlight / props.d.size) * 100 : 0;
  };
  return (
    <div
      class={[
        "flex overflow-hidden rounded-full bg-ink/8",
        props.thick === true ? "h-2.5" : "h-1.5",
        props.class,
      ]}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct())}
    >
      <div
        class={[toneBar[status(props.d).tone], "h-full transition-[width] duration-500"]}
        style={{ width: `${pct()}%` }}
      />
      <div class="h-full bg-blue/25" style={{ width: `${flight()}%` }} />
    </div>
  );
}

export const Avatar = () => (
  <span class="grid size-8 place-items-center rounded-full bg-ink font-semibold text-[13px] text-paper">
    D
  </span>
);

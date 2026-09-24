import type { Tone } from "./format";
import { toneBar } from "./format";

// Confirmed work is solid; in-flight parts are a pale tail (RELIABILITY:
// progress reflects confirmed work, in-flight activity shown separately).
export function Progress(props: {
  class?: string;
  flightPct: number;
  pct: number;
  thick?: boolean;
  tone: Tone;
}) {
  return (
    <div
      class={[
        "flex overflow-hidden rounded-full bg-ink/8",
        props.thick === true ? "h-2.5" : "h-1.5",
        props.class,
      ]}
      role="progressbar"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(props.pct)}
    >
      <div
        class={[toneBar[props.tone], "h-full transition-[width] duration-500 ease-smooth"]}
        style={{ width: `${props.pct}%` }}
      />
      <div class="h-full bg-blue/25" style={{ width: `${props.flightPct}%` }} />
    </div>
  );
}

export const Avatar = (props: { name: string }) => (
  <span class="grid size-8 place-items-center rounded-full bg-ink font-semibold text-[13px] text-paper">
    {props.name.trim().charAt(0).toUpperCase() || "?"}
  </span>
);

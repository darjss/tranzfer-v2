import { css, cx } from "styled-system/css";
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
      class={cx(
        css({
          bg: "ink/8",
          borderRadius: "full",
          display: "flex",
          h: props.thick === true ? "2.5" : "1.5",
          overflow: "hidden",
        }),
        props.class,
      )}
      role="progressbar"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(props.pct)}
    >
      <div
        class={cx(
          toneBar[props.tone],
          css({
            h: "full",
            transitionDuration: "[500ms]",
            transitionProperty: "[width]",
            transitionTimingFunction: "smooth",
          }),
        )}
        style={{ width: `${props.pct}%` }}
      />
      <div class={css({ bg: "blue/25", h: "full" })} style={{ width: `${props.flightPct}%` }} />
    </div>
  );
}

export const Avatar = (props: { name: string }) => (
  <span
    class={css({
      bg: "ink",
      borderRadius: "full",
      boxSize: "8",
      color: "paper",
      display: "grid",
      fontSize: "[13px]",
      fontWeight: "semibold",
      placeItems: "center",
    })}
  >
    {props.name.trim().charAt(0).toUpperCase() || "?"}
  </span>
);

import { css, cx } from "styled-system/css";

// Nav logo: two open frames, one arrow, underline draws on load (keyframes
// `draw`/`redraw` live in landing.css). Source of truth for the mark is
// docs/design/logo/tranzfer-mark.svg.

const bar = cx(
  "bar",
  css({
    _groupHover: { animationName: "[redraw]" },
    strokeDasharray: "1",
    strokeDashoffset: "1",
  }),
);
const slow = cx(bar, css({ animation: "[draw .5s var(--easings-smooth) forwards]" }));
const quick = cx(bar, css({ animation: "[draw .25s var(--easings-smooth) .4s forwards]" }));
const late = cx(bar, css({ animation: "[draw .25s var(--easings-smooth) .7s forwards]" }));

export default function Brand() {
  return (
    <a
      class={cx(
        "brand group",
        css({
          alignItems: "center",
          color: "ink",
          display: "inline-flex",
          fontSize: "xl",
          fontWeight: "bold",
          gap: "[9px]",
          letterSpacing: "[-0.02em]",
        }),
      )}
      href="/"
      aria-label="Tranzfer"
    >
      <svg
        class={css({ boxSize: "[34px]", mt: "0.5" })}
        viewBox="0 0 32 32"
        fill="none"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M14 14.5A3.5 3.5 0 0 0 10.5 11h-5A3.5 3.5 0 0 0 2 14.5v5A3.5 3.5 0 0 0 5.5 23h5a3.5 3.5 0 0 0 3.5-3.5"
          stroke="var(--colors-blue)"
          stroke-opacity=".4"
        />
        <path
          d="M18 17.5a3.5 3.5 0 0 0 3.5 3.5h5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 26.5 9h-5A3.5 3.5 0 0 0 18 12.5"
          stroke="var(--colors-blue)"
        />
        <path class={slow} pathLength="1" d="M6 16h20" stroke="currentColor" />
        <path class={quick} pathLength="1" d="M23.2 13.2 26 16l-2.8 2.8" stroke="currentColor" />
      </svg>
      <span class={cx("word", css({ lineHeight: "none", pos: "relative" }))}>
        tranzfer
        <svg
          class={css({
            bottom: "[-3px]",
            h: "1.5",
            left: "[-1px]",
            overflow: "visible",
            pos: "absolute",
            w: "full",
          })}
          viewBox="0 0 60 6"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            class={late}
            pathLength="1"
            d="M1 4.6c10-1.6 22-2.4 36-2.2"
            stroke="var(--colors-blue)"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </span>
    </a>
  );
}

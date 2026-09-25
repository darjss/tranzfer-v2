import type { ParentProps } from "solid-js";
import { css, cx } from "styled-system/css";

// Margin scribbles for the notebook layer. Positioning stays inline CSS so
// each note is tuned where it is used; `.ink`/`.hand` reveal on scroll.

type Tone = "" | "blue" | "red";

const tone = {
  "": css({ color: "ink" }),
  blue: css({ color: "blue" }),
  red: css({ color: "rust" }),
} satisfies Record<Tone, string>;

export function Hand(props: ParentProps<{ tone?: Tone; style: string }>) {
  return (
    <span
      class={cx(
        "hand",
        css({
          "& s": { opacity: 0.7, textDecorationThickness: "2px" },
          "&.in": { opacity: 0.55, translate: "[0 0]" },
          display: { base: "none", lg: "block" },
          fontFamily: "hand",
          fontSize: "[22px]",
          fontWeight: "semibold",
          lineHeight: "[1.1]",
          opacity: 0,
          pointerEvents: "none",
          pos: "absolute",
          rotate: "var(--r, -4deg)",
          transitionDelay: "var(--d, 0s)",
          transitionDuration: "[500ms]",
          transitionProperty: "[opacity,translate]",
          transitionTimingFunction: "smooth",
          translate: "[0 6px]",
          zIndex: 3,
        }),
        tone[props.tone ?? ""],
      )}
      style={props.style}
    >
      {props.children}
    </span>
  );
}

export const inkStrokes = css({
  "& *": {
    fill: "[none]",
    stroke: "[currentColor]",
    strokeDasharray: "var(--len, 600)",
    strokeDashoffset: "var(--len, 600)",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "[2.2]",
    transitionDelay: "var(--d, 0s)",
    transitionDuration: "[1.3s]",
    transitionProperty: "[stroke-dashoffset]",
    transitionTimingFunction: "[cubic-bezier(.6,0,.2,1)]",
  },
  "&.in > *": { strokeDashoffset: "0" },
});

export function Ink(props: ParentProps<{ tone?: Tone; style: string; viewBox: string }>) {
  return (
    <svg
      class={cx(
        "ink",
        css({
          display: { base: "none", lg: "block" },
          opacity: 0.8,
          overflow: "visible",
          pointerEvents: "none",
          pos: "absolute",
          zIndex: 3,
        }),
        inkStrokes,
        tone[props.tone ?? ""],
      )}
      style={props.style}
      viewBox={props.viewBox}
    >
      {props.children}
    </svg>
  );
}

export const Asterisk = (props: { tone?: Tone; style: string }) => (
  <Ink tone={props.tone} style={props.style} viewBox="0 0 34 34">
    <path d="M17 3v28M4 10l26 14M30 10 4 24" style={{ "--d": "1.1s", "--len": "120" }} />
  </Ink>
);

export const Ring = (props: { style: string }) => (
  <div class={cx("halo", css({ display: { base: "none", lg: "block" } }))} style={props.style} />
);
export const Blob = (props: { style: string }) => (
  <div
    class={css({
      borderRadius: "full",
      filter: "[blur(60px)]",
      opacity: 0.35,
      pointerEvents: "none",
      pos: "absolute",
      zIndex: 0,
    })}
    style={props.style}
  />
);

export function Still(props: { src: string; label: string; style: string; in?: boolean }) {
  return (
    <div
      class={[
        "still",
        css({
          "&.in": {
            animation: "[drift 7s ease-in-out infinite]",
            opacity: 1,
            transform: "[translate(0,0) scale(1)]",
          },
          _after: {
            bottom: "[5px]",
            color: "mut",
            content: "attr(data-l)",
            fontFamily: "mono",
            fontSize: "[9px]",
            left: "2",
            letterSpacing: "[.08em]",
            pos: "absolute",
            textTransform: "uppercase",
          },
          animationDelay: "var(--d)",
          aspectRatio: "var(--ar, 3/2)",
          bg: "white",
          borderRadius: "md",
          left: "var(--x)",
          opacity: 0,
          overflow: "hidden",
          paddingBottom: "[22px]",
          pointerEvents: "none",
          pos: "absolute",
          pt: "1.5",
          px: "1.5",
          rotate: "var(--r)",
          shadow: "[0 30px 60px -30px rgba(23,24,28,.55),0 0 0 1px rgba(0,0,0,.06)]",
          top: "var(--y)",
          transform: "[translate(var(--dx,0),var(--dy,0)) scale(.6)]",
          transition: "[transform 1.1s var(--easings-spring),opacity .6s ease]",
          transitionDelay: "var(--d)",
          w: "var(--w)",
        }),
        { in: props.in === true },
      ]}
      data-l={props.label}
      style={props.style}
    >
      <img
        src={props.src}
        alt=""
        class={css({
          borderRadius: "[3px]",
          boxSize: "full",
          filter: "[saturate(.9) contrast(1.05)]",
          objectFit: "cover",
        })}
      />
    </div>
  );
}

export const ArrowIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

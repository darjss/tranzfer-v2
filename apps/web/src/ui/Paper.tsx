import type { JSX } from "@solidjs/web";
import { css, cx } from "styled-system/css";

const ghost = css({
  bg: "panel",
  borderRadius: "card",
  inset: "0",
  pos: "absolute",
  shadow: "paperGhost",
});

export const paperTitle = css({
  fontSize: { base: "26", sm: "40" },
  fontWeight: "semibold",
  letterSpacing: "title",
  lineHeight: "compact",
  overflowWrap: "anywhere",
  textWrap: "balance",
});

export const paperFrom = css({ color: "mut", fontFamily: "mono", fontSize: "13" });

/** A stack of paper, the landing's card language, holding one delivery. */
export const Paper = (props: { children: JSX.Element }) => (
  <div class={css({ marginInline: "auto", maxW: "[680px]", pos: "relative" })}>
    <div class={cx(ghost, css({ transform: "[rotate(-2.5deg) translate(-10px,12px)]" }))} />
    <div class={cx(ghost, css({ transform: "[rotate(2deg) translate(10px,8px)]" }))} />
    <div
      class={css({
        bg: "panel",
        borderRadius: "card",
        p: { base: "5", sm: "8" },
        pos: "relative",
        rotate: { base: "[0deg]", sm: "[-0.6deg]" },
        shadow: "paper",
      })}
    >
      {props.children}
    </div>
  </div>
);

export const StateIcon = (props: { children: JSX.Element; tone: "blue" | "mut" | "rust" }) => (
  <span
    aria-hidden="true"
    class={cx(
      css({ borderRadius: "full", boxSize: "11", display: "grid", mb: "5", placeItems: "center" }),
      props.tone === "blue" && css({ bg: "blue/10", color: "blue" }),
      props.tone === "mut" && css({ bg: "ink/6", color: "mut" }),
      props.tone === "rust" && css({ bg: "rust/10", color: "rust" }),
    )}
  >
    {props.children}
  </span>
);

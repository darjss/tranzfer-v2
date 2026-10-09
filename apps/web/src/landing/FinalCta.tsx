import { css, cx } from "styled-system/css";
import { ArrowIcon, Hand, Ink, Still } from "./notebook";
import { eyebrow, sideTitle } from "./styles";
import { button } from "../ui/Button";
import morningPacking from "./assets/morning-packing.webp";

/** The sign-off: one taped sheet with the headline and the button on it. */
export default function FinalCta() {
  return (
    <section class={css({ pb: { base: "10", lg: "14" }, pt: { base: "6", lg: "10" } })}>
      <div
        class={cx(
          "taped",
          "rv",
          css({
            alignItems: "center",
            bg: "panel",
            borderRadius: "card",
            columnGap: "10",
            display: "grid",
            gridTemplateColumns: { base: "1fr", md: "minmax(0,1fr) auto" },
            pos: "relative",
            px: { base: "6", lg: "14" },
            py: { base: "8", lg: "12" },
            rotate: "var(--r)",
            rowGap: "6",
            shadow: "paper",
          }),
        )}
        style="--r:-.6deg"
      >
        <span class="tape" />
        <div
          class={css({
            display: { base: "none", lg: "block" },
            inset: "0",
            pointerEvents: "none",
            pos: "absolute",
          })}
        >
          <Still
            in
            src={morningPacking}
            label="wrap day"
            style="--w:96px;--ar:2/3;--x:91%;--y:-42%;--r:9deg"
          />
        </div>
        <div class={css({ pos: "relative", zIndex: 1 })}>
          <p class={eyebrow}>20 GB free, no card</p>
          <h2 class={sideTitle}>
            Go on. <i>Send the big one.</i>
          </h2>
        </div>
        <div class={css({ pos: "relative", zIndex: 1 })}>
          <Hand tone="red" style="right:110%;top:-6%;--r:-6deg;--d:1.2s;white-space:nowrap">
            your turn.
            <br />
            make it a big one.
          </Hand>
          <Ink tone="red" style="right:100%;top:44%;width:56px;height:34px" viewBox="0 0 60 36">
            <path d="M4 6 C 20 30, 40 30, 54 22" style="--len:80;--d:.6s" />
            <path d="M44 14 56 22 44 32" style="--len:40;--d:1.1s" />
          </Ink>
          <a class={button()} href="/sign-in">
            Start free <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}

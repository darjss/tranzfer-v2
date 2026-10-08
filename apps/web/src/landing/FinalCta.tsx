import { css, cx } from "styled-system/css";
import { ArrowIcon, Blob, Hand, Ink, Still } from "./notebook";
import { eyebrow, sectionTitle } from "./styles";
import { button } from "../ui/Button";
import morningPacking from "./assets/morning-packing.webp";
import nightTravel from "./assets/night-travel.webp";

export default function FinalCta() {
  return (
    <section
      class={cx(
        "final",
        css({
          overflow: "hidden",
          pos: "relative",
          py: { base: "20", lg: "40" },
          textAlign: "center",
        }),
      )}
    >
      <Blob style="width:600px;height:400px;left:20%;top:20%;background:#ffe0bd" />
      <Ink tone="red" style="left:27%;top:56%;width:110px;height:70px" viewBox="0 0 120 90">
        <path d="M6 84 C 20 40, 60 20, 110 14" style="--len:260" />
        <path d="M94 4 114 14 100 32" style="--len:60;--d:1s" />
      </Ink>
      <Hand tone="red" style="left:14%;top:72%;--r:-6deg;--d:1.2s">
        your turn.
        <br />
        make it a big one.
      </Hand>
      <Still
        in
        src={morningPacking}
        label="wrap day"
        style="--w:120px;--ar:2/3;--x:2%;--y:10%;--r:-8deg"
      />
      <Still in src={nightTravel} label="pickup" style="--w:140px;--x:84%;--y:55%;--r:9deg" />
      <p class={eyebrow}>20 GB free, no card</p>
      <h2
        class={cx(
          "rv",
          css({ marginInline: "auto", mb: "[30px]", pos: "relative", zIndex: 1 }),
          sectionTitle,
        )}
      >
        Go on. <i>Send the big one.</i>
      </h2>
      <a
        class={cx(css(button.raw(), { pos: "relative", zIndex: 1 }), "rv")}
        href="/sign-in"
        style="--d:80ms"
      >
        Start free <ArrowIcon />
      </a>
    </section>
  );
}

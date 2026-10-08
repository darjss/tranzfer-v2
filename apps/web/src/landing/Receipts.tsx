import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { Hand } from "./notebook";
import { eyebrow, lede, section, sectionTitle } from "./styles";

// The 100 GB beta gate from docs/BENCHMARKS.md, printed as a till receipt.
// Every line is something that run recorded.
const broken = [
  "wi-fi off, 90 seconds",
  "one piece refused",
  "page reloaded",
  "tab closed",
  "laptop frozen, 20 min",
  "browser crashed",
  "wrong file picked",
  "the 'done' reply lost",
];

const row = css({
  "& > span:nth-child(2)": {
    borderBottomStyle: "dotted",
    borderBottomWidth: "1px",
    borderColor: "ink/25",
    flex: "1",
    mb: "1",
  },
  display: "flex",
  gap: "2",
  justifyContent: "space-between",
});

const Line = (props: { label: string; value: string; strong?: boolean }) => (
  <div class={cx(row, props.strong === true && css({ fontWeight: "semibold" }))}>
    <span>{props.label}</span>
    <span />
    <span>{props.value}</span>
  </div>
);

export default function Receipts() {
  return (
    <section
      class={cx(
        section,
        css({
          alignItems: "center",
          display: "grid",
          gap: { base: "12", lg: "20" },
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,1.1fr) minmax(0,.9fr)" },
        }),
      )}
    >
      <div>
        <p class={eyebrow}>Receipts</p>
        <h2 class={cx("rv", sectionTitle)}>
          We broke it on purpose.
          <br />
          <i>It didn't care.</i>
        </h2>
        <p class={cx("rv", lede)} style="--d:80ms">
          Before anyone else touched it, we sent 100 GiB through Tranzfer and wrecked the upload
          eight different ways. It finished. The file on the other end matched the original exactly.
          Here's the receipt.
        </p>
      </div>

      <div class={css({ justifySelf: { base: "center", lg: "end" }, pos: "relative" })}>
        <Hand tone="blue" style="left:-34%;top:58%;--r:-8deg;--d:.6s">
          no refunds
          <br />
          needed.
        </Hand>
        <div
          class={cx(
            "rv",
            css({
              _after: {
                bg: "white",
                bottom: "-3",
                content: "''",
                h: "3",
                insetInline: "0",
                mask: "[conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50% / 16px 100%]",
                pos: "absolute",
              },
              bg: "white",
              color: "ink",
              fontFamily: "mono",
              fontSize: "[14px]",
              lineHeight: "[1.7]",
              maxW: "[340px]",
              p: "7",
              pb: "8",
              pos: "relative",
              rotate: "[2deg]",
              shadow: "[0 40px 70px -40px rgba(23,24,28,.55)]",
              w: "full",
            }),
          )}
        >
          <p class={css({ fontWeight: "semibold", letterSpacing: "widest", textAlign: "center" })}>
            TRANZFER
          </p>
          <p class={css({ color: "mut", fontSize: "11", textAlign: "center" })}>
            100 GiB test run · 5 oct 2026
          </p>
          <div
            class={css({
              borderColor: "ink/30",
              borderTopStyle: "dashed",
              borderTopWidth: "1px",
              my: "4",
            })}
          />
          <Line label="upload" value="100 GiB" />
          <Line label="things broken" value="8" />
          <ul class={css({ color: "mut", fontSize: "13", listStyle: "none", my: "1.5", pl: "4" })}>
            <For each={broken}>{(item) => <li>· {item}</li>}</For>
          </ul>
          <Line label="files re-picked" value="5 times" />
          <Line label="arrived, then resent" value="0 bytes" />
          <div
            class={css({
              borderColor: "ink/30",
              borderTopStyle: "dashed",
              borderTopWidth: "1px",
              my: "4",
            })}
          />
          <Line label="file at the end" value="IDENTICAL" strong />
          <p class={css({ color: "mut", fontSize: "11", mt: "5", textAlign: "center" })}>
            thank you. come again with
            <br />
            something bigger.
          </p>
        </div>
      </div>
    </section>
  );
}

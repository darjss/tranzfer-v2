import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { faq } from "./faq";
import { eyebrow, sideTitle } from "./styles";

export default function Faq() {
  return (
    <section
      id="faq"
      class={css({
        display: "grid",
        gap: { base: "8", lg: "16" },
        gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) minmax(0,1.5fr)" },
        py: { base: "12", lg: "16" },
      })}
    >
      <div class={css({ alignSelf: "start", pos: { lg: "sticky" }, top: "8" })}>
        <p class={eyebrow}>Questions</p>
        <h2 class={cx("rv", sideTitle)}>
          Before you send <i>the big one.</i>
        </h2>
      </div>
      <div class={css({ borderBottomWidth: "1px", borderColor: "line" })}>
        <For each={faq}>
          {(item) => (
            <details
              class={css({
                "&[open] summary span": { rotate: "[45deg]" },
                borderColor: "line",
                borderTopWidth: "1px",
              })}
            >
              <summary
                class={css({
                  "&::-webkit-details-marker": { display: "none" },
                  alignItems: "center",
                  cursor: "pointer",
                  display: "flex",
                  fontSize: "[19px]",
                  fontWeight: "semibold",
                  gap: "4",
                  justifyContent: "space-between",
                  letterSpacing: "snug",
                  listStyle: "none",
                  py: "5",
                })}
              >
                {item.q}
                <span
                  aria-hidden="true"
                  class={css({
                    color: "blue",
                    flexShrink: 0,
                    fontSize: "26",
                    fontWeight: "normal",
                    lineHeight: "none",
                    transitionDuration: "normal",
                    transitionProperty: "[rotate]",
                  })}
                >
                  +
                </span>
              </summary>
              <p class={css({ color: "mut", maxW: "[60ch]", pb: "6", textStyle: "lg" })}>
                {item.a}
              </p>
            </details>
          )}
        </For>
      </div>
    </section>
  );
}

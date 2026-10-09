import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { ArrowIcon } from "./notebook";
import { eyebrow, section, smallTitle } from "./styles";
import { audiences } from "../marketing/content";

// Index cards, one per use-case page. The copy comes from content.ts so the
// card and the page it links to say the same thing.
const tilt = [-1.5, 1, -0.5, 1.5, -1, 0.5];

export default function MadeFor() {
  return (
    <section class={section}>
      <div
        class={css({
          alignItems: "end",
          display: "flex",
          flexWrap: "wrap",
          gap: "4",
          justifyContent: "space-between",
          mb: "8",
        })}
      >
        <div>
          <p class={eyebrow}>Made for</p>
          <h2 class={cx("rv", smallTitle)}>
            Pick your <i>kind of big.</i>
          </h2>
        </div>
        <p class={cx("rv", css({ color: "mut", fontSize: "15", maxW: "[44ch]" }))}>
          Camera cards, RAW shoots, project files, session stems. Each page walks through a send for
          that kind of work.
        </p>
      </div>
      <ul
        class={css({
          display: "grid",
          gap: { base: "3.5", lg: "4" },
          gridTemplateColumns: {
            base: "repeat(2,minmax(0,1fr))",
            lg: "repeat(6,minmax(0,1fr))",
            md: "repeat(3,minmax(0,1fr))",
          },
          listStyle: "none",
        })}
      >
        <For each={audiences}>
          {(a, i) => (
            <li class="rv" style={`--d:${i() * 50}ms`}>
              <a
                href={`/for/${a.slug}`}
                class={cx(
                  "group",
                  css({
                    "@media (hover: hover)": {
                      _hover: { rotate: "[0deg]", shadow: "paperLift", translate: "[0 -4px]" },
                    },
                    // An index card: a red rule under the header, faint blue lines below.
                    bg: "white",
                    bgImage:
                      "[linear-gradient(transparent 39px,rgba(200,65,43,.45) 39px,rgba(200,65,43,.45) 40px,transparent 40px),repeating-linear-gradient(transparent 0 23px,rgba(39,64,196,.1) 23px 24px)]",
                    bgPosition: "[0 0,0 40px]",
                    borderRadius: "sm",
                    display: "flex",
                    flexDir: "column",
                    h: "full",
                    minH: "[200px]",
                    p: "3.5",
                    rotate: "var(--r)",
                    shadow: "paperRow",
                    transitionDuration: "[350ms]",
                    transitionProperty: "[translate,rotate,box-shadow]",
                    transitionTimingFunction: "smooth",
                  }),
                )}
                style={`--r:${tilt[i()]}deg`}
              >
                <span
                  class={css({
                    alignItems: "center",
                    color: "ink",
                    display: "flex",
                    fontSize: "13",
                    fontWeight: "semibold",
                    h: "[22px]",
                    justifyContent: "space-between",
                  })}
                >
                  {a.eyebrow}
                  <span
                    class={css({
                      "& svg": { boxSize: "3.5" },
                      _groupHover: { translate: "[3px 0]" },
                      color: "blue",
                      transitionDuration: "nudge",
                      transitionProperty: "[translate]",
                    })}
                  >
                    <ArrowIcon />
                  </span>
                </span>
                <span
                  class={css({
                    fontSize: "17",
                    fontWeight: "semibold",
                    letterSpacing: "snug",
                    lineHeight: "[24px]",
                    mt: "1",
                    textWrap: "balance",
                  })}
                >
                  {a.title[0]}
                </span>
                <For each={(a.files ?? []).slice(0, 2)}>
                  {(file) => (
                    <span
                      class={css({
                        color: "mut",
                        fontFamily: "mono",
                        fontSize: "11",
                        lineHeight: "[24px]",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      })}
                    >
                      {file}
                    </span>
                  )}
                </For>
                <span
                  class={css({
                    color: "blue",
                    fontFamily: "hand",
                    fontSize: "[20px]",
                    fontWeight: "semibold",
                    lineHeight: "[24px]",
                    mt: "auto",
                    pt: "3",
                    rotate: "[-2deg]",
                  })}
                >
                  {a.note}
                </span>
              </a>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

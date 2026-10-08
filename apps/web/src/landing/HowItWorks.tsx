import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { Hand } from "./notebook";
import { eyebrow, section, sectionHead, sectionTitle } from "./styles";
import filmmaker from "./assets/filmmaker.webp";
import loftPacking from "./assets/loft-packing.webp";
import videoEdit from "./assets/video-edit.webp";

const steps = [
  {
    h: "Drop the cards",
    p: "Drag in files or whole folders, hit send, walk away. That's the whole setup.",
    src: videoEdit,
  },
  {
    h: "Close the laptop if you must",
    p: "Interrupted? It waits on your dashboard. Pick the files again and only the missing bits go up.",
    src: loftPacking,
  },
  {
    h: "Send one link",
    p: "Your editor clicks it and downloads. No account, no app, no excuses.",
    src: filmmaker,
  },
];

export default function HowItWorks() {
  return (
    <section id="how" class={section}>
      <Hand style="right:0;top:6%;--r:4deg;--d:.5s">
        made for laptops
        <br />
        that need to sleep.
      </Hand>
      <div class={sectionHead}>
        <p class={eyebrow}>How it works</p>
        <h2 class={cx("rv", sectionTitle)}>
          From camera card <i>to editor.</i>
        </h2>
      </div>
      <div
        class={css({
          display: "grid",
          gap: "4.5",
          gridTemplateColumns: { base: "1fr", lg: "repeat(3,minmax(0,1fr))" },
        })}
      >
        <For each={steps}>
          {(s, i) => (
            <div
              class={cx(
                "rv",
                "group",
                css({
                  _after: {
                    bgGradient: "to-b",
                    content: "''",
                    gradientFrom: "transparent",
                    gradientFromPosition: "30%",
                    gradientTo: "[rgba(23,24,28,.85)]",
                    inset: "0",
                    pos: "absolute",
                  },
                  bg: "panel",
                  borderRadius: "card",
                  display: "flex",
                  flexDir: "column",
                  justifyContent: "flex-end",
                  minH: "[380px]",
                  overflow: "hidden",
                  pos: "relative",
                  shadow: "ring",
                }),
              )}
              style={`--d:${i() * 80}ms`}
            >
              <img
                class={css({
                  _groupHover: { scale: "[1.06]" },
                  boxSize: "full",
                  inset: "0",
                  objectFit: "cover",
                  pos: "absolute",
                  transitionDuration: "[1.2s]",
                  transitionProperty: "[scale]",
                  transitionTimingFunction: "smooth",
                })}
                src={s.src}
                alt=""
                loading="lazy"
              />
              <div class={css({ color: "paper", p: "6.5", pos: "relative", zIndex: 1 })}>
                <span
                  class={css({
                    color: "[#9fb0ff]",
                    fontFamily: "mono",
                    letterSpacing: "widest",
                    textStyle: "xs",
                  })}
                >
                  0{i() + 1}
                </span>
                <h3
                  class={css({
                    fontSize: "26",
                    fontWeight: "semibold",
                    letterSpacing: "tight",
                    my: "2.5",
                  })}
                >
                  {s.h}
                </h3>
                <p class={css({ color: "[#c9c6bc]", fontSize: "15" })}>{s.p}</p>
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

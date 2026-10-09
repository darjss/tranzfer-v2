import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { Hand } from "./notebook";
import { eyebrow, section, smallTitle } from "./styles";
import { photos } from "./photos";

const filmmaker = photos["./assets/filmmaker.webp"];
const loftPacking = photos["./assets/loft-packing.webp"];
const videoEdit = photos["./assets/video-edit.webp"];

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
    <section
      id="how"
      class={cx(
        section,
        css({
          display: "grid",
          gap: { base: "4.5", lg: "5" },
          gridTemplateColumns: {
            base: "1fr",
            lg: "minmax(0,.9fr) repeat(3,minmax(0,1fr))",
            md: "repeat(3,minmax(0,1fr))",
          },
        }),
      )}
    >
      <div
        class={css({
          alignSelf: "center",
          gridColumn: { lg: "auto", md: "1 / -1" },
          pos: "relative",
          pr: { lg: "4" },
        })}
      >
        <p class={eyebrow}>How it works</p>
        <h2 class={cx("rv", smallTitle)}>
          From camera card <i>to editor.</i>
        </h2>
        <p class={cx("rv", css({ color: "mut", fontSize: "15", mt: "3.5", textWrap: "pretty" }))}>
          A browser on your end, a link on theirs. Nothing to install.
        </p>
        <Hand style="left:0;top:112%;--r:-4deg;--d:.5s">
          made for laptops
          <br />
          that need to sleep.
        </Hand>
      </div>
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
                  gradientFromPosition: "25%",
                  gradientTo: "[rgba(23,24,28,.88)]",
                  inset: "0",
                  pos: "absolute",
                },
                bg: "panel",
                borderRadius: "card",
                display: "flex",
                flexDir: "column",
                justifyContent: "flex-end",
                minH: { base: "[260px]", lg: "[340px]" },
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
              src={s.src.src}
              srcset={s.src.srcset}
              sizes="(min-width: 1024px) 280px, (min-width: 768px) 240px, 100vw"
              width={s.src.w}
              height={s.src.h}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div class={css({ color: "paper", p: "5", pos: "relative", zIndex: 1 })}>
              <span
                class={css({
                  color: "[#c9d2ff]",
                  fontFamily: "mono",
                  fontWeight: "semibold",
                  letterSpacing: "widest",
                  textStyle: "xs",
                })}
              >
                0{i() + 1}
              </span>
              <h3
                class={css({
                  fontSize: "22",
                  fontWeight: "semibold",
                  letterSpacing: "tight",
                  lineHeight: "compact",
                  my: "2",
                })}
              >
                {s.h}
              </h3>
              <p class={css({ color: "[#c9c6bc]", fontSize: "15", lineHeight: "[1.45]" })}>{s.p}</p>
            </div>
          </div>
        )}
      </For>
    </section>
  );
}

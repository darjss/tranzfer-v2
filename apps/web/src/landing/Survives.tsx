import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { Hand, Ink, Ring } from "./notebook";
import { eyebrow, lede, section, sectionHead, sectionTitle } from "./styles";
import wrong1 from "./assets/wrong-01-cafe-wifi.webp";
import wrong2 from "./assets/wrong-02-train-sleep.webp";
import wrong3 from "./assets/wrong-03-refreshed-tab.webp";
import wrong4 from "./assets/wrong-04-overnight.webp";
import wrong5 from "./assets/wrong-05-damaged-piece.webp";
import wrong6 from "./assets/wrong-06-delivered.webp";

// Each card is something the 100 GB test upload lives through
// (docs/BENCHMARKS.md). Say what happens in plain words, never more than the
// test proves.
const disasters = [
  {
    at: "63% · wi-fi gone",
    h: "The café Wi-Fi died. Classic.",
    p: "Tranzfer waits it out, then carries on from the last piece that made it. Your coffee goes cold. Your upload doesn't.",
    rot: -3,
    src: wrong1,
  },
  {
    at: "25% · tab refreshed",
    h: "Someone refreshed the tab.",
    p: "Pick the same files again. Tranzfer remembers what already arrived and sends only the rest.",
    rot: 2,
    src: wrong3,
  },
  {
    at: "40% · browser crashed",
    h: "Your browser crashed.",
    p: "Open Tranzfer again. The upload is waiting on your dashboard, right where it stopped.",
    rot: -1.5,
    src: wrong2,
  },
  {
    at: "50% · frozen 20 min",
    h: "Your laptop went to sleep.",
    p: "Wake it up and it carries on. Nothing that already arrived gets thrown away. We froze one for 20 minutes mid-upload to check.",
    rot: 2.5,
    src: wrong4,
  },
  {
    at: "70% · wrong copy picked",
    h: "You grabbed the copy, not the original.",
    p: "When you pick files again, Tranzfer checks them against what it already has. No match? It stops and tells you, instead of stitching two shoots together.",
    rot: -2,
    src: wrong5,
  },
  {
    at: "100% · delivered",
    done: true,
    h: "Delivered. Obviously.",
    p: "Your editor downloads exactly what you sent. Same file, every single byte.",
    rot: 1.5,
    src: wrong6,
  },
];

const stamp = css({
  borderRadius: "md",
  borderWidth: "2px",
  display: "inline-block",
  fontFamily: "mono",
  fontSize: "11",
  fontWeight: "medium",
  letterSpacing: "widest",
  mt: "3.5",
  mx: "1.5",
  opacity: 0.85,
  px: "2",
  py: "0.5",
  rotate: "[-4deg]",
  textTransform: "uppercase",
});

export default function Survives() {
  return (
    <section id="survives" class={section}>
      <Ring style="left:60%;top:2%;width:120px;height:120px" />
      <Ink tone="red" style="left:34%;top:9%;width:120px;height:60px" viewBox="0 0 120 60">
        <path d="M4 50 C 30 10, 70 10, 112 30" style="--len:200" />
        <path d="M96 18 116 30 100 44" style="--len:60;--d:.9s" />
      </Ink>
      <Hand tone="red" style="left:45%;top:2%;--r:5deg;--d:1s">
        it's never 12%.
        <br />
        it's always 63%.
      </Hand>
      <Hand style="right:-2%;top:12%;--r:-7deg;--d:.6s;text-align:right">
        bytes sent
        <br />
        twice: zero.
      </Hand>
      <div class={sectionHead}>
        <p class={eyebrow}>What it survives</p>
        <h2 class={cx("rv", sectionTitle)}>
          It's 3am. You're at 63%.
          <br />
          <i>The Wi-Fi just died.</i>
        </h2>
        <p class={cx("rv", lede)} style="--d:80ms">
          Other tools make you start over. Tranzfer keeps every piece that already arrived and only
          sends what's missing. We did all six of these to one 100 GB upload, on purpose, and it
          still finished with the exact same file.
        </p>
      </div>
      <div
        class={cx(
          "desk",
          css({
            columnGap: "6",
            display: "grid",
            gridTemplateColumns: {
              base: "1fr",
              lg: "repeat(3,minmax(0,1fr))",
              md: "repeat(2,minmax(0,1fr))",
            },
            p: "3",
            rowGap: "7",
          }),
        )}
      >
        <For each={disasters}>
          {(d, i) => (
            <article
              class={cx(
                "note",
                "rv",
                css({
                  bg: "white",
                  borderRadius: "md",
                  paddingBottom: "5",
                  pos: "relative",
                  pt: "2.5",
                  px: "2.5",
                  rotate: "var(--r)",
                  shadow: "[0 34px 60px -36px rgba(23,24,28,.5),0 0 0 1px rgba(0,0,0,.06)]",
                }),
              )}
              style={`--r:${d.rot}deg;--d:${i() * 80}ms`}
            >
              <span class="tape" />
              <div
                class={cx(
                  "ph",
                  css({
                    aspectRatio: "landscape",
                    borderRadius: "photo",
                    overflow: "hidden",
                    pos: "relative",
                  }),
                )}
                data-gb={d.at}
              >
                <img
                  class={css({ boxSize: "full", filter: "[saturate(.85)]", objectFit: "cover" })}
                  src={d.src}
                  alt=""
                  loading="lazy"
                />
              </div>
              <h3
                class={css({
                  fontWeight: "semibold",
                  letterSpacing: "snug",
                  lineHeight: "compact",
                  mb: "1.5",
                  mt: "4",
                  mx: "1.5",
                  textStyle: "xl",
                  textWrap: "balance",
                })}
              >
                {d.h}
              </h3>
              <p class={css({ color: "mut", mx: "1.5", textStyle: "sm", textWrap: "pretty" })}>
                {d.p}
              </p>
              <span
                class={cx(stamp, d.done === true ? css({ color: "blue" }) : css({ color: "ok" }))}
              >
                {d.done === true ? "Done" : "Survived"}
              </span>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

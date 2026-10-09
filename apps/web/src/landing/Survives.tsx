import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { Hand, Ink } from "./notebook";
import { Receipt } from "./Receipts";
import { eyebrow, lede, section, sideTitle } from "./styles";
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
  flexShrink: 0,
  fontFamily: "mono",
  fontSize: "11",
  fontWeight: "medium",
  letterSpacing: "widest",
  mt: "0.5",
  opacity: 0.85,
  px: "2",
  py: "0.5",
  rotate: "[-4deg]",
  textTransform: "uppercase",
});

export default function Survives() {
  return (
    <section
      id="survives"
      class={cx(
        section,
        css({
          columnGap: "16",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,5fr) minmax(0,6fr)" },
          rowGap: "10",
        }),
      )}
    >
      <Hand tone="red" style="left:28%;top:5%;--r:5deg;--d:1s">
        it's never 12%.
        <br />
        it's always 63%.
      </Hand>

      {/* On phones the receipt drops below the notes, so the column dissolves. */}
      <div class={css({ display: { base: "contents", lg: "flex" }, flexDir: "column" })}>
        <div>
          <p class={eyebrow}>What it survives</p>
          <h2 class={cx("rv", sideTitle)}>
            It's 3am.
            <br />
            You're at 63%.
            <br />
            <i>The Wi-Fi just died.</i>
          </h2>
          <p class={cx("rv", lede)} style="--d:80ms">
            Other tools make you start over. Tranzfer keeps every piece that already arrived and
            only sends what's missing. Before anyone else touched it, we sent 100 GiB through it and
            wrecked the upload eight different ways. It finished with the exact same file.
          </p>
        </div>
        <div
          class={css({
            alignSelf: "center",
            justifySelf: "center",
            order: { base: 2, lg: 0 },
            pos: "relative",
            pt: { lg: "16" },
            w: "[min(100%,340px)]",
          })}
        >
          <Hand tone="blue" style="left:-6%;top:1%;--r:-6deg;--d:.6s">
            we broke it on purpose.
            <br />
            it didn't care.
          </Hand>
          <Ink tone="blue" style="left:62%;top:2%;width:70px;height:60px" viewBox="0 0 70 60">
            <path d="M4 6 C 40 4, 60 20, 58 52" style="--len:90;--d:.9s" />
            <path d="M46 42 58 54 66 40" style="--len:40;--d:1.4s" />
          </Ink>
          <Receipt />
        </div>
      </div>

      <div
        class={cx(
          "desk",
          css({
            "& > :nth-child(even)": { lg: { top: "12" } },
            alignItems: "start",
            columnGap: "6",
            display: "grid",
            gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" },
            pt: { lg: "3" },
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
                  paddingBottom: "4",
                  pos: "relative",
                  pt: "2.5",
                  px: "2.5",
                  rotate: "var(--r)",
                  shadow: "[0 34px 60px -36px rgba(23,24,28,.5),0 0 0 1px rgba(0,0,0,.06)]",
                }),
              )}
              style={`--r:${d.rot}deg;--d:${(i() % 2) * 90}ms`}
            >
              <span class="tape" />
              <div
                class={cx(
                  "ph",
                  css({
                    aspectRatio: "[16/9]",
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
              <div
                class={css({
                  alignItems: "start",
                  display: "flex",
                  gap: "3",
                  justifyContent: "space-between",
                  mt: "3.5",
                  mx: "1.5",
                })}
              >
                <h3
                  class={css({
                    fontSize: "[19px]",
                    fontWeight: "semibold",
                    letterSpacing: "snug",
                    lineHeight: "compact",
                    textWrap: "balance",
                  })}
                >
                  {d.h}
                </h3>
                <span
                  class={cx(stamp, d.done === true ? css({ color: "blue" }) : css({ color: "ok" }))}
                >
                  {d.done === true ? "Done" : "Survived"}
                </span>
              </div>
              <p
                class={css({
                  color: "mut",
                  mt: "1.5",
                  mx: "1.5",
                  textStyle: "sm",
                  textWrap: "pretty",
                })}
              >
                {d.p}
              </p>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

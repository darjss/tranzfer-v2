import { For, createSignal, onSettled } from "solid-js";
import { css, cx } from "styled-system/css";
import Reel from "./Reel";
import { ArrowIcon, Asterisk, Blob, Hand, Ink, Ring, Still, inkStrokes } from "./notebook";
import { eyebrow } from "./styles";
import { button } from "../ui/Button";
import { photos } from "./photos";

const coastRoad = photos["./assets/coast-road.webp"];
const frozenWilds = photos["./assets/frozen-wilds.webp"];
const hikerSea = photos["./assets/hiker-sea.webp"];
const neonCrosswalk = photos["./assets/neon-crosswalk.webp"];

const words = ["shoot.", "night.", "card.", "season."];

// Frames from "your footage", taped round the upload card on the desk.
const stills = [
  {
    label: "a-cam · 214 gb",
    priority: true,
    src: neonCrosswalk,
    style: "--w:190px;--x:1%;--y:4%;--r:-8deg;--dx:-200px;--dy:-80px;--d:.15s",
  },
  {
    label: "drone · 61 gb",
    src: coastRoad,
    style: "--w:118px;--ar:2/3;--x:17%;--y:40%;--r:6deg;--dx:-180px;--dy:160px;--d:.45s",
  },
  {
    label: "b-cam · 188 gb",
    src: frozenWilds,
    style: "--w:176px;--x:80%;--y:2%;--r:7deg;--dx:200px;--dy:-120px;--d:.3s",
  },
  {
    label: "audio · 2 gb",
    src: hikerSea,
    style: "--w:150px;--x:84%;--y:62%;--r:-9deg;--dx:160px;--dy:200px;--d:.6s",
  },
];

const shift = (i: number) => (i % 2 ? 1 : -1) * (8 + i * 4);

export default function Hero() {
  const [word, setWord] = createSignal(0, { name: "hero-word" });
  const [prev, setPrev] = createSignal(-1, { name: "hero-word-prev" });
  const [mounted, setMounted] = createSignal(false, { name: "mounted" });
  const [pos, setPos] = createSignal<{ x: number; y: number }>();

  const tilt = () => {
    const p = pos();
    return p === undefined
      ? { x: 0, y: 0 }
      : { x: p.x / innerWidth - 0.5, y: p.y / innerHeight - 0.5 };
  };

  // Pointer parallax; landing.css zeroes it on coarse pointers.
  const onMove = (e: MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  onSettled(() => {
    setMounted(true);
    // Reduced motion keeps the headline on "shoot." and the stills in place.
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      addEventListener("mousemove", onMove);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interval = still
      ? undefined
      : setInterval(() => {
          setPrev(word());
          setWord((w) => (w + 1) % words.length);
          timeout = setTimeout(() => {
            setPrev(-1);
          }, 600);
        }, 2600);
    return () => {
      removeEventListener("mousemove", onMove);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  });

  return (
    <section class={css({ pos: "relative", pt: { base: "10", lg: "14" } })}>
      <Blob style="width:520px;height:520px;left:-10%;top:-10%;background:#ffd9b0" />
      <Blob style="width:460px;height:460px;right:-8%;bottom:-10%;background:#c9d2ff" />

      <div
        class={css({
          alignItems: "end",
          columnGap: "14",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,8fr) minmax(0,4fr)" },
          pos: "relative",
          rowGap: "6",
          zIndex: 2,
        })}
      >
        <div>
          <p class={cx("rv", eyebrow)}>For editors, shooters and studios</p>
          <h1
            class={cx(
              "rv",
              css({
                fontSize: "[clamp(44px,5.3vw,68px)]",
                fontWeight: "semibold",
                letterSpacing: "[-0.045em]",
                lineHeight: "[.96]",
                mt: "4",
              }),
            )}
          >
            Send the whole{" "}
            <span class={css({ display: "inline-block", pos: "relative" })}>
              <span class={css({ srOnly: true })}>shoot.</span>
              <span class="flip" aria-hidden="true">
                <For each={words}>
                  {(w, i) => <span class={{ on: word() === i(), out: prev() === i() }}>{w}</span>}
                </For>
              </span>
              <svg
                class={cx(
                  "ink",
                  css({
                    bottom: "-1",
                    color: "blue",
                    h: "4.5",
                    left: "-1",
                    opacity: 0.8,
                    overflow: "visible",
                    pointerEvents: "none",
                    pos: "absolute",
                    right: "-1",
                    w: "auto",
                    zIndex: 3,
                  }),
                  inkStrokes,
                )}
                viewBox="0 0 260 26"
                preserveAspectRatio="none"
              >
                <path d="M4 18 C 60 6, 120 22, 178 10 S 240 12, 256 8" style="--len:290;--d:.8s" />
              </svg>
            </span>
            <br />
            Sleep anyway.
          </h1>
        </div>
        <div class={css({ pb: { lg: "1.5" } })}>
          <p
            class={cx(
              "rv",
              css({
                color: "[#3a3b40]",
                fontWeight: "medium",
                lineHeight: "[1.45]",
                maxW: "[40ch]",
                textStyle: "lg",
                textWrap: "pretty",
              }),
            )}
            style="--d:120ms"
          >
            Hundreds of gigabytes, straight from your browser. Wi-Fi drops? It retries. Laptop naps?
            It waits. Closed the tab? Pick the same files and it carries on. Your editor gets one
            link.
          </p>
          <div
            class={cx(
              "rv",
              css({
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: "6.5",
                mt: "6",
              }),
            )}
            style="--d:200ms"
          >
            <a class={button()} href="/sign-in">
              Start free <ArrowIcon />
            </a>
            <a
              class={css({
                "& span": {
                  display: "inline-block",
                  transitionDuration: "nudge",
                  transitionProperty: "[translate]",
                  transitionTimingFunction: "smooth",
                },
                "&:hover span": { translate: "[0 3px]" },
                _hover: { borderColor: "ink" },
                borderBottomWidth: "1px",
                borderColor: "ink/25",
                color: "ink",
                fontSize: "15",
                fontWeight: "semibold",
                paddingBottom: "0.5",
                transitionDuration: "normal",
                transitionProperty: "[border-color]",
              })}
              href="#survives"
            >
              Watch it survive <span>↓</span>
            </a>
          </div>
        </div>
      </div>

      {/* The desk: the upload card in the middle, its footage taped round it. */}
      <div
        class={css({
          display: "grid",
          justifyItems: "center",
          mt: { base: "12", lg: "10" },
          pb: { base: "12", lg: "14" },
          pos: "relative",
        })}
      >
        <div
          class={cx(
            "scatter",
            css({
              display: { base: "none", lg: "block" },
              inset: "0",
              pointerEvents: "none",
              pos: "absolute",
              zIndex: 0,
            }),
          )}
        >
          <For each={stills}>
            {(s, i) => (
              <Still
                {...s}
                in={mounted()}
                style={`${s.style};translate:${tilt().x * shift(i())}px ${tilt().y * shift(i())}px`}
              />
            )}
          </For>
        </div>
        <Ring style="left:24%;top:-6%" />
        <Hand style="right:4%;top:36%;--r:-4deg;--d:1.2s">
          it's always 63%.
          <br />
          always.
        </Hand>
        <Ink style="right:17%;top:23%;width:110px;height:70px" viewBox="0 0 120 80">
          <path d="M112 74 C 90 30, 60 14, 10 18" style="--len:170;--d:.4s" />
          <path d="M24 6 8 18 22 32" style="--len:50;--d:1.1s" />
        </Ink>
        <Hand tone="red" style="left:0;top:58%;width:170px;text-align:center;--r:-4deg;--d:1.4s">
          tested at <b style="font-size:26px">100 GB</b>
          <br />
          <small style="font-size:16px">8 things broken on purpose</small>
        </Hand>
        <Asterisk style="left:21%;bottom:8%;width:28px;height:28px" />
        <Asterisk tone="blue" style="right:22%;top:-4%;width:22px;height:22px" />
        <Reel />
      </div>
    </section>
  );
}

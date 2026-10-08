import { For, createSignal, onSettled } from "solid-js";
import { css, cx } from "styled-system/css";
import Reel from "./Reel";
import { ArrowIcon, Asterisk, Blob, Hand, Ink, Ring, Still, inkStrokes } from "./notebook";
import { eyebrow } from "./styles";
import { button } from "../ui/Button";
import coastRoad from "./assets/coast-road.webp";
import frozenWilds from "./assets/frozen-wilds.webp";
import hikerSea from "./assets/hiker-sea.webp";
import neonCrosswalk from "./assets/neon-crosswalk.webp";

const words = ["shoot.", "night.", "card.", "season."];

// Frames from "your footage", scattered round the headline.
const stills = [
  {
    label: "a-cam · 214 gb",
    src: neonCrosswalk,
    style: "--w:140px;--x:-11%;--y:4%;--r:-9deg;--dx:-200px;--dy:-120px;--d:.15s",
  },
  {
    label: "b-cam · 188 gb",
    src: frozenWilds,
    style: "--w:130px;--x:35%;--y:3%;--r:7deg;--dx:80px;--dy:-220px;--d:.3s",
  },
  {
    label: "drone · 61 gb",
    src: coastRoad,
    style: "--w:110px;--ar:2/3;--x:-12%;--y:74%;--r:6deg;--dx:-180px;--dy:200px;--d:.45s",
  },
  {
    label: "audio · 2 gb",
    src: hikerSea,
    style: "--w:110px;--x:41%;--y:84%;--r:-12deg;--dx:120px;--dy:220px;--d:.6s",
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

  // Pointer parallax; App.css zeroes it on coarse pointers.
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
    <section
      class={css({
        alignItems: "center",
        display: "grid",
        gap: "10",
        gridTemplateColumns: { base: "1fr", lg: "repeat(2,minmax(0,1fr))" },
        minH: { base: "0", lg: "[calc(100vh - 64px)]" },
        paddingBottom: { base: "20", lg: "[120px]" },
        pos: "relative",
        py: { base: "12", lg: "[72px]" },
      })}
    >
      <Blob style="width:520px;height:520px;left:-10%;top:-10%;background:#ffd9b0" />
      <Blob style="width:420px;height:420px;right:-6%;bottom:-20%;background:#c9d2ff" />
      <Ring style="right:8%;top:4%" />
      <Ink style="left:45%;top:24%;width:150px;height:110px" viewBox="0 0 180 120">
        <path
          d="M6 100 C 40 30, 90 20, 120 60 C 140 88, 130 24, 168 22"
          style="--len:330;--d:.4s"
        />
        <path d="M150 14 L 170 22 L 156 38" style="--len:60;--d:1.3s" />
      </Ink>
      <Hand style="left:56%;top:1%;--r:-3deg;--d:1.2s">
        it's always 63%.
        <br />
        always.
      </Hand>
      <Hand tone="red" style="right:-1%;bottom:2%;width:150px;text-align:center;--r:-4deg;--d:1.4s">
        tested at <b style="font-size:26px">100 GB</b>
        <br />
        <small style="font-size:16px">8 things broken on purpose</small>
      </Hand>
      <Asterisk style="left:34%;bottom:6%;width:30px;height:30px" />
      <Asterisk tone="blue" style="right:-3%;top:40%;width:24px;height:24px" />

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

      <div class={css({ pos: "relative", zIndex: 2 })}>
        <p class={cx("rv", eyebrow)}>For editors, shooters and studios</p>
        <h1
          class={cx(
            "rv",
            css({
              fontSize: "[clamp(44px,5.3vw,80px)]",
              fontWeight: "semibold",
              letterSpacing: "[-0.045em]",
              lineHeight: "[.96]",
              mt: "4",
              textWrap: "balance",
            }),
          )}
        >
          Send the whole
          <br />
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
        <p
          class={cx(
            "rv",
            css({
              color: "[#3a3b40]",
              fontWeight: "medium",
              lineHeight: "[1.4]",
              maxW: "[36ch]",
              mb: "[34px]",
              mt: "6.5",
              textStyle: "xl",
              textWrap: "[pretty]",
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
            css({ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "6.5" }),
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

      <Reel />
    </section>
  );
}

import { For, createSignal, onSettled } from "solid-js";
import { css, cx } from "styled-system/css";
import Brand from "./Brand";
import Uploader from "./Uploader";
import { ArrowIcon, Asterisk, Blob, Hand, Ink, Ring, Still, inkStrokes } from "./notebook";
import { button } from "../ui/Button";
import "./landing.css";
import coastRoad from "./assets/coast-road.webp";
import filmmaker from "./assets/filmmaker.webp";
import frozenWilds from "./assets/frozen-wilds.webp";
import hikerSea from "./assets/hiker-sea.webp";
import loftPacking from "./assets/loft-packing.webp";
import morningPacking from "./assets/morning-packing.webp";
import neonCrosswalk from "./assets/neon-crosswalk.webp";
import nightTravel from "./assets/night-travel.webp";
import videoEdit from "./assets/video-edit.webp";
import wrong1 from "./assets/wrong-01-cafe-wifi.webp";
import wrong2 from "./assets/wrong-02-train-sleep.webp";
import wrong3 from "./assets/wrong-03-refreshed-tab.webp";
import wrong4 from "./assets/wrong-04-overnight.webp";
import wrong5 from "./assets/wrong-05-damaged-piece.webp";
import wrong6 from "./assets/wrong-06-delivered.webp";

const words = ["shoot.", "night.", "card.", "season."];

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

const failures = [
  {
    gb: "38 GB landed",
    h: "Café Wi-Fi died",
    p: "Goal: wait for the connection and retry only the missing parts.",
    r: "Planned",
    rot: -3,
    src: wrong1,
  },
  {
    gb: "141 GB landed",
    h: "Laptop slept on the train",
    p: "Goal: check the remote parts after wake and continue from them.",
    r: "Planned",
    rot: 2,
    src: wrong2,
  },
  {
    gb: "220 GB landed",
    h: "Someone refreshed the tab",
    p: "Goal: reselect and verify the same file, then resume the existing upload.",
    r: "Planned",
    rot: -1.5,
    src: wrong3,
  },
  {
    gb: "221 GB landed",
    h: "Left it overnight",
    p: "Goal: renew expired authorization without discarding uploaded parts.",
    r: "Planned",
    rot: 2.5,
    src: wrong4,
  },
  {
    gb: "311 GB landed",
    h: "One piece arrived damaged",
    p: "Goal: detect a failed part and retry it without restarting the file.",
    r: "Planned",
    rot: -2,
    src: wrong5,
  },
  {
    gb: "350 GB · done",
    h: "Delivered",
    p: "Goal: confirm completion and let the recipient download the correct file.",
    r: "Planned",
    rot: 1.5,
    src: wrong6,
  },
];

const steps = [
  {
    h: "Drop the cards",
    p: "Select a file and start a multipart upload directly to storage.",
    src: videoEdit,
  },
  {
    h: "Resume after interruptions",
    p: "Restore file access when needed and continue from confirmed uploaded parts.",
    src: loftPacking,
  },
  {
    h: "Send one link",
    p: "Give your editor an authorized download link with a clear expiry.",
    src: filmmaker,
  },
];

const ticker = [
  ["EP04_A-Cam", "214 GB → Berlin"],
  ["Coast_Film", "350 GB → Lisbon"],
  ["River_Below", "96 GB → Ulaanbaatar"],
  ["Studio_Session", "286 GB → New York"],
  ["Travel_EP03", "402 GB → Seoul"],
  ["Wedding_Day2", "130 GB → Melbourne"],
];

const shift = (i: number) => (i % 2 ? 1 : -1) * (8 + i * 4);

const mono = css({
  color: "mut",
  fontFamily: "mono",
  fontSize: "[11px]",
  letterSpacing: "[.1em]",
  textTransform: "uppercase",
});
const head = css({ maxW: "[60ch]", mb: "16" });
const h2 = css({
  "& i": { color: "blue", fontStyle: "italic" },
  fontSize: "[clamp(34px,4.6vw,60px)]",
  fontWeight: "semibold",
  letterSpacing: "[-0.04em]",
  lineHeight: "none",
  mt: "3.5",
  textWrap: "balance",
});

export default function Landing() {
  const [word, setWord] = createSignal(0, { name: "hero-word" });
  const [prev, setPrev] = createSignal(-1, { name: "hero-word-prev" });
  const [mounted, setMounted] = createSignal(false, { name: "mounted" });
  const [pos, setPos] = createSignal<{ x: number; y: number }>();

  let root: HTMLDivElement | undefined;
  const tilt = () => {
    const p = pos();
    return p === undefined
      ? { x: 0, y: 0 }
      : { x: p.x / innerWidth - 0.5, y: p.y / innerHeight - 0.5 };
  };

  onSettled(() => {
    setMounted(true);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "-40px" },
    );
    for (const el of root?.querySelectorAll(".rv,.chip,.ink,.hand") ?? []) {
      io.observe(el);
    }

    // Pointer parallax; App.css zeroes it on coarse pointers.
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    addEventListener("mousemove", onMove);

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setPrev(word());
      setWord((w) => (w + 1) % words.length);
      timeout = setTimeout(() => {
        setPrev(-1);
      }, 600);
    }, 2600);

    return () => {
      io.disconnect();
      removeEventListener("mousemove", onMove);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  });

  return (
    <div
      ref={(el) => {
        root = el;
      }}
      class={css({ overflowX: "clip" })}
    >
      <div class={css({ marginInline: "auto", maxW: "[1180px]", pos: "relative", px: "7" })}>
        <nav
          class={css({
            alignItems: "center",
            borderBottomWidth: "1px",
            borderColor: "ink",
            display: "flex",
            h: "16",
            justifyContent: "space-between",
            pos: "relative",
            zIndex: 5,
          })}
        >
          <Brand />
          <ul
            class={css({
              alignItems: "center",
              color: "mut",
              display: "flex",
              fontSize: "sm",
              fontWeight: "medium",
              gap: "7",
              listStyle: "none",
            })}
          >
            <li class={css({ display: { base: "none", md: "block" } })}>
              <a class={css({ _hover: { color: "ink" } })} href="#desk">
                Recovery goals
              </a>
            </li>
            <li class={css({ display: { base: "none", md: "block" } })}>
              <a class={css({ _hover: { color: "ink" } })} href="#how">
                Planned workflow
              </a>
            </li>
            <li>
              <a class={css({ _hover: { color: "ink" } })} href="/sign-in">
                Sign in
              </a>
            </li>
          </ul>
        </nav>

        <section
          class={css({
            alignItems: "center",
            display: "grid",
            gap: "10",
            gridTemplateColumns: { base: "1fr", lg: "repeat(2,minmax(0,1fr))" },
            minH: { base: "0", lg: "[calc(100vh-64px)]" },
            paddingBottom: { base: "20", lg: "[140px]" },
            pos: "relative",
            py: { base: "12", lg: "[72px]" },
          })}
        >
          <Blob style="width:520px;height:520px;left:-10%;top:-10%;background:#ffd9b0" />
          <Blob style="width:420px;height:420px;right:-6%;bottom:-20%;background:#c9d2ff" />
          <Ring style="right:8%;top:4%" />
          <Ink style="left:45%;top:26%;width:150px;height:110px" viewBox="0 0 180 120">
            <path
              d="M6 100 C 40 30, 90 20, 120 60 C 140 88, 130 24, 168 22"
              style="--len:330;--d:.4s"
            />
            <path d="M150 14 L 170 22 L 156 38" style="--len:60;--d:1.3s" />
          </Ink>
          <Ink tone="red" style="right:-1%;bottom:4%;width:150px;height:74px" viewBox="0 0 150 74">
            <ellipse
              cx="75"
              cy="37"
              rx="70"
              ry="30"
              style="--len:420;--d:.9s"
              transform="rotate(-4 75 37)"
            />
          </Ink>
          <Hand
            tone="red"
            style="right:0;bottom:6%;width:130px;text-align:center;--r:-4deg;--d:1.4s"
          >
            the target:
            <br />
            <b style="font-size:28px">resume</b>
            <br />
            <small style="font-size:15px">verify first.</small>
          </Hand>
          <Asterisk style="left:34%;bottom:6%;width:30px;height:30px" />
          <Asterisk tone="blue" style="right:-3%;top:40%;width:24px;height:24px" />
          <Hand style="left:56%;top:1%;--r:-3deg;--d:1.2s">
            example: 463 GB.
            <br />
            designed for big shoots.
          </Hand>
          <Hand tone="blue" style="left:50%;bottom:9%;--r:-3deg;--d:1.8s">
            ↑ upload design, still in progress
          </Hand>

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
            <h1
              class={cx(
                "rv",
                css({
                  fontSize: "[clamp(44px,5.3vw,80px)]",
                  fontWeight: "semibold",
                  letterSpacing: "[-0.045em]",
                  lineHeight: "[.96]",
                  textWrap: "balance",
                }),
              )}
            >
              Send the whole
              <br />
              <span class={css({ display: "inline-block", pos: "relative" })}>
                <span class="flip">
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
                      h: "[18px]",
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
                  <path
                    d="M4 18 C 60 6, 120 22, 178 10 S 240 12, 256 8"
                    style="--len:290;--d:.8s"
                  />
                </svg>
              </span>
              <br />
              Built to resume.
            </h1>
            <p
              class={cx(
                "rv",
                css({
                  color: "[#3a3b40]",
                  fontSize: "xl",
                  fontWeight: "medium",
                  lineHeight: "[1.4]",
                  maxW: "[34ch]",
                  mb: "[34px]",
                  mt: "[26px]",
                  textWrap: "[pretty]",
                }),
              )}
              style="--d:120ms"
            >
              Tranzfer is an early build for sending large files to your editor. Sign-in works.
              Uploads are not available yet. The preview shows what we are building.
            </p>
            <div
              class={cx(
                "rv",
                css({ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "[26px]" }),
              )}
              style="--d:200ms"
            >
              <a class={button()} href="/sign-in">
                Sign in <ArrowIcon />
              </a>
              <a
                class={css({
                  "& span": {
                    display: "inline-block",
                    transitionDuration: "[250ms]",
                    transitionProperty: "[translate]",
                    transitionTimingFunction: "smooth",
                  },
                  "&:hover span": { translate: "[4px 0]" },
                  _hover: { borderColor: "ink" },
                  borderBottomWidth: "1px",
                  borderColor: "ink/25",
                  color: "ink",
                  fontSize: "[15px]",
                  fontWeight: "semibold",
                  paddingBottom: "0.5",
                  transitionDuration: "[200ms]",
                  transitionProperty: "[border-color]",
                })}
                href="#desk"
              >
                Explore the recovery goals <span>→</span>
              </a>
            </div>
          </div>

          <Uploader in={mounted()} rx={-tilt().y * 8} ry={tilt().x * 10} />
        </section>
      </div>

      <div class="ticker" aria-label="Illustrative transfer examples">
        <div class="marq">
          <For each={[...ticker, ...ticker]}>
            {([name, route]) => (
              <span>
                <b>{name}</b> {route}
              </span>
            )}
          </For>
        </div>
      </div>

      <div class={css({ marginInline: "auto", maxW: "[1180px]", pos: "relative", px: "7" })}>
        <section id="desk" class={css({ pos: "relative", py: { base: "20", lg: "[120px]" } })}>
          <Ring style="left:60%;top:2%;width:120px;height:120px" />
          <Ink tone="red" style="left:34%;top:9%;width:120px;height:60px" viewBox="0 0 120 60">
            <path d="M4 50 C 30 10, 70 10, 112 30" style="--len:200" />
            <path d="M96 18 116 30 100 44" style="--len:60;--d:.9s" />
          </Ink>
          <Hand tone="red" style="left:45%;top:2%;--r:5deg;--d:1s">
            what if wifi dies?
            <br />
            keep the parts.
          </Hand>
          <Hand style="right:-2%;top:12%;--r:-7deg;--d:.6s;text-align:right">
            the goal: resume
            <br />
            after an interruption.
          </Hand>
          <Hand tone="blue" style="left:-9%;top:70%;--r:-5deg;--d:.8s">
            make recovery
            <br />
            predictable.
          </Hand>
          <div class={head}>
            <p class={mono}>Illustrated recovery goals, not a completed transfer</p>
            <h2 class={cx("rv", h2)}>
              When a transfer breaks.
              <br />
              <i>Keep the work already done.</i>
            </h2>
            <p
              class={cx("rv", css({ color: "mut", fontSize: "lg", maxW: "[52ch]", mt: "[18px]" }))}
              style="--d:80ms"
            >
              The goal is to check which parts arrived, verify that the source file is unchanged,
              and send only what is missing. These scenarios describe planned behavior.
            </p>
          </div>
          <div
            class={cx(
              "desk",
              css({
                columnGap: "6",
                display: "grid",
                gridTemplateColumns: { base: "1fr", lg: "repeat(3,minmax(0,1fr))" },
                p: "3",
                rowGap: "7",
              }),
            )}
          >
            <For each={failures}>
              {(f, i) => (
                <article
                  class={cx(
                    "note",
                    "rv",
                    css({
                      bg: "white",
                      borderRadius: "md",
                      paddingBottom: "[18px]",
                      pos: "relative",
                      pt: "2.5",
                      px: "2.5",
                      rotate: "var(--r)",
                      shadow: "[0 34px 60px -36px rgba(23,24,28,.5),0 0 0 1px rgba(0,0,0,.06)]",
                    }),
                  )}
                  style={`--r:${f.rot}deg;--d:${i() * 80}ms`}
                >
                  <span class="tape" />
                  <div
                    class={cx(
                      "ph",
                      css({
                        aspectRatio: "landscape",
                        borderRadius: "[3px]",
                        overflow: "hidden",
                        pos: "relative",
                      }),
                    )}
                    data-gb={f.gb}
                  >
                    <img
                      class={css({
                        boxSize: "full",
                        filter: "[saturate(.85)]",
                        objectFit: "cover",
                      })}
                      src={f.src}
                      alt=""
                      loading="lazy"
                    />
                  </div>
                  <h3
                    class={css({
                      fontSize: "xl",
                      fontWeight: "semibold",
                      letterSpacing: "[-0.02em]",
                      lineHeight: "[1.1]",
                      mb: "1.5",
                      mt: "4",
                      mx: "1.5",
                    })}
                  >
                    {f.h}
                  </h3>
                  <p class={css({ color: "mut", fontSize: "sm", mx: "1.5" })}>{f.p}</p>
                  <span
                    class={cx(
                      "r",
                      css({
                        color: "ok",
                        display: "inline-block",
                        fontFamily: "mono",
                        fontSize: "[11px]",
                        letterSpacing: "[.08em]",
                        mt: "3",
                        mx: "1.5",
                        textTransform: "uppercase",
                      }),
                    )}
                  >
                    {f.r}
                  </span>
                </article>
              )}
            </For>
          </div>
        </section>

        <section id="how" class={css({ pos: "relative", py: { base: "20", lg: "[120px]" } })}>
          <Hand style="right:0;top:6%;--r:4deg;--d:.5s">
            planned for laptops
            <br />
            that need to sleep.
          </Hand>
          <div class={head}>
            <p class={mono}>Planned workflow</p>
            <h2 class={cx("rv", h2)}>
              From camera card <i>to editor.</i>
            </h2>
          </div>
          <div
            class={cx(
              "steps",
              css({
                display: "grid",
                gap: "[18px]",
                gridTemplateColumns: { base: "1fr", lg: "repeat(3,minmax(0,1fr))" },
              }),
            )}
          >
            <For each={steps}>
              {(s, i) => (
                <div
                  class={cx(
                    "step",
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
                      borderRadius: "[20px]",
                      display: "flex",
                      flexDir: "column",
                      justifyContent: "flex-end",
                      minH: "[380px]",
                      outlineColor: "line",
                      outlineStyle: "solid",
                      outlineWidth: "1px",
                      overflow: "hidden",
                      pos: "relative",
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
                      transitionProperty: "[scale,filter]",
                      transitionTimingFunction: "smooth",
                    })}
                    src={s.src}
                    alt=""
                    loading="lazy"
                  />
                  <div class={css({ color: "paper", p: "[26px]", pos: "relative", zIndex: 1 })}>
                    <span
                      class={css({
                        color: "[#9fb0ff]",
                        fontFamily: "mono",
                        fontSize: "xs",
                        letterSpacing: "[.1em]",
                      })}
                    >
                      0{i() + 1}
                    </span>
                    <h3
                      class={css({
                        fontSize: "[26px]",
                        fontWeight: "semibold",
                        letterSpacing: "[-0.025em]",
                        my: "2.5",
                      })}
                    >
                      {s.h}
                    </h3>
                    <p class={css({ color: "[#c9c6bc]", fontSize: "[15px]" })}>{s.p}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>

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
            next up:
            <br />
            the first upload.
          </Hand>
          <Still
            in
            src={morningPacking}
            label="wrap day"
            style="--w:120px;--ar:2/3;--x:2%;--y:10%;--r:-8deg"
          />
          <Still in src={nightTravel} label="pickup" style="--w:140px;--x:84%;--y:55%;--r:9deg" />
          <p class={mono}>Early build</p>
          <h2
            class={cx(
              "rv",
              css({ marginInline: "auto", mb: "[30px]", mt: "3.5", pos: "relative", zIndex: 1 }),
              h2,
            )}
          >
            Large files. <i>Still building.</i>
          </h2>
          <a
            class={cx(button(), "rv", css({ pos: "relative", zIndex: 1 }))}
            href="/sign-in"
            style="--d:80ms"
          >
            Sign in <ArrowIcon />
          </a>
        </section>
        <footer
          class={css({
            borderColor: "ink",
            borderTopWidth: "1px",
            color: "mut",
            display: "flex",
            fontSize: "[13px]",
            justifyContent: "space-between",
            paddingBottom: "[60px]",
            pt: "7",
          })}
        >
          <span>© 2026 Tranzfer</span>
          <span>Built for the work between shoots.</span>
        </footer>
      </div>
    </div>
  );
}

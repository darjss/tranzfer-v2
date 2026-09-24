import { For, createSignal, onSettled } from "solid-js";
import Brand from "./Brand";
import Uploader from "./Uploader";
import { ArrowIcon, Asterisk, Blob, Hand, Ink, Ring, Still } from "./notebook";
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

const mono = "font-mono text-[11px] tracking-[.1em] uppercase text-mut";
const head = "mb-16 max-w-[60ch]";
const h2 =
  "mt-3.5 text-balance text-[clamp(34px,4.6vw,60px)] leading-none font-semibold tracking-[-0.04em] [&_i]:italic [&_i]:text-blue";

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
      class="overflow-x-clip"
    >
      <div class="relative mx-auto max-w-[1180px] px-7">
        <nav class="relative z-5 flex h-16 items-center justify-between border-b border-ink">
          <Brand />
          <ul class="flex list-none items-center gap-7 text-sm font-medium text-mut">
            <li class="hidden md:block">
              <a class="hover:text-ink" href="#desk">
                Recovery goals
              </a>
            </li>
            <li class="hidden md:block">
              <a class="hover:text-ink" href="#how">
                Planned workflow
              </a>
            </li>
            <li>
              <a class="hover:text-ink" href="/sign-in">
                Sign in
              </a>
            </li>
          </ul>
        </nav>

        <section class="relative grid min-h-0 grid-cols-1 items-center gap-10 py-12 pb-20 lg:min-h-[calc(100vh-64px)] lg:grid-cols-2 lg:py-[72px] lg:pb-[140px]">
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

          <div class="scatter pointer-events-none absolute inset-0 z-0 hidden lg:block">
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

          <div class="relative z-2">
            <h1 class="rv text-balance text-[clamp(44px,5.3vw,80px)] leading-[.96] font-semibold tracking-[-0.045em]">
              Send the whole
              <br />
              <span class="relative inline-block">
                <span class="flip">
                  <For each={words}>
                    {(w, i) => <span class={{ on: word() === i(), out: prev() === i() }}>{w}</span>}
                  </For>
                </span>
                <svg
                  class="ink pointer-events-none absolute -right-1 -bottom-1 -left-1 z-3 h-[18px] w-auto overflow-visible text-blue opacity-80 *:fill-none *:stroke-current *:stroke-[2.2] *:transition-[stroke-dashoffset] *:duration-[1.3s] *:ease-[cubic-bezier(.6,0,.2,1)] *:[stroke-dasharray:var(--len,600)] *:[stroke-dashoffset:var(--len,600)] *:[stroke-linecap:round] *:[stroke-linejoin:round] *:[transition-delay:var(--d,0s)] [&.in>*]:[stroke-dashoffset:0]"
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
              class="rv mt-[26px] mb-[34px] max-w-[34ch] text-pretty text-xl leading-[1.4] font-medium text-[#3a3b40]"
              style="--d:120ms"
            >
              Tranzfer is an early build for sending large files to your editor. Sign-in works.
              Uploads are not available yet. The preview shows what we are building.
            </p>
            <div class="rv flex flex-wrap items-center gap-[26px]" style="--d:200ms">
              <a class={button()} href="/sign-in">
                Sign in <ArrowIcon />
              </a>
              <a
                class="border-b border-ink/25 pb-0.5 text-[15px] font-semibold text-ink transition-[border-color] duration-200 hover:border-ink [&_span]:inline-block [&_span]:transition-[translate] [&_span]:duration-250 [&_span]:ease-smooth [&:hover_span]:translate-x-1"
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

      <div class="relative mx-auto max-w-[1180px] px-7">
        <section id="desk" class="relative py-20 lg:py-[120px]">
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
            <h2 class={["rv", h2]}>
              When a transfer breaks.
              <br />
              <i>Keep the work already done.</i>
            </h2>
            <p class="rv mt-[18px] max-w-[52ch] text-lg text-mut" style="--d:80ms">
              The goal is to check which parts arrived, verify that the source file is unchanged,
              and send only what is missing. These scenarios describe planned behavior.
            </p>
          </div>
          <div class="desk grid grid-cols-1 gap-y-7 gap-x-6 p-3 lg:grid-cols-3">
            <For each={failures}>
              {(f, i) => (
                <article
                  class="note rv relative rounded-md bg-white px-2.5 pt-2.5 pb-[18px] shadow-[0_34px_60px_-36px_rgba(23,24,28,.5),0_0_0_1px_rgba(0,0,0,.06)] rotate-(--r)"
                  style={`--r:${f.rot}deg;--d:${i() * 80}ms`}
                >
                  <span class="tape" />
                  <div class="ph relative aspect-4/3 overflow-hidden rounded-[3px]" data-gb={f.gb}>
                    <img
                      class="size-full object-cover saturate-[.85]"
                      src={f.src}
                      alt=""
                      loading="lazy"
                    />
                  </div>
                  <h3 class="mx-1.5 mt-4 mb-1.5 text-xl leading-[1.1] font-semibold tracking-[-0.02em]">
                    {f.h}
                  </h3>
                  <p class="mx-1.5 text-sm text-mut">{f.p}</p>
                  <span class="r mx-1.5 mt-3 inline-block font-mono text-[11px] tracking-[.08em] uppercase text-ok">
                    {f.r}
                  </span>
                </article>
              )}
            </For>
          </div>
        </section>

        <section id="how" class="relative py-20 lg:py-[120px]">
          <Hand style="right:0;top:6%;--r:4deg;--d:.5s">
            planned for laptops
            <br />
            that need to sleep.
          </Hand>
          <div class={head}>
            <p class={mono}>Planned workflow</p>
            <h2 class={["rv", h2]}>
              From camera card <i>to editor.</i>
            </h2>
          </div>
          <div class="steps grid grid-cols-1 gap-[18px] lg:grid-cols-3">
            <For each={steps}>
              {(s, i) => (
                <div
                  class="step rv group relative flex min-h-[380px] flex-col justify-end overflow-hidden rounded-[20px] bg-panel ring-1 ring-line after:absolute after:inset-0 after:bg-linear-to-b after:from-transparent after:from-30% after:to-[rgba(23,24,28,.85)] after:content-['']"
                  style={`--d:${i() * 80}ms`}
                >
                  <img
                    class="absolute inset-0 size-full object-cover transition-[scale,filter] duration-[1.2s] ease-smooth group-hover:scale-[1.06]"
                    src={s.src}
                    alt=""
                    loading="lazy"
                  />
                  <div class="relative z-1 p-[26px] text-paper">
                    <span class="font-mono text-xs tracking-[.1em] text-[#9fb0ff]">0{i() + 1}</span>
                    <h3 class="my-2.5 text-[26px] font-semibold tracking-[-0.025em]">{s.h}</h3>
                    <p class="text-[15px] text-[#c9c6bc]">{s.p}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>

        <section class="final relative overflow-hidden py-20 text-center lg:py-40">
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
          <h2 class={["rv relative z-1 mx-auto mt-3.5 mb-[30px]", h2]}>
            Large files. <i>Still building.</i>
          </h2>
          <a class={button({ class: "rv relative z-1" })} href="/sign-in" style="--d:80ms">
            Sign in <ArrowIcon />
          </a>
        </section>
        <footer class="flex justify-between border-t border-ink pt-7 pb-[60px] text-[13px] text-mut">
          <span>© 2026 Tranzfer</span>
          <span>Built for the work between shoots.</span>
        </footer>
      </div>
    </div>
  );
}

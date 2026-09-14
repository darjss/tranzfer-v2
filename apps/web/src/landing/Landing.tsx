import { For, createEffect, createSignal, onSettled } from "solid-js";
import { createViewportObserver } from "@solid-primitives/intersection-observer";
import { type MousePosition, createMousePosition } from "@solid-primitives/mouse";
import { createTimer } from "@solid-primitives/timer";
import Brand from "./Brand";
import Uploader from "./Uploader";
import { ArrowIcon, Asterisk, Blob, Hand, Ink, Ring, Still } from "./notebook";
import { Button } from "../ui/Button";
import "./landing.css";
import coastRoad from "./assets/coast-road.webp";
import filmmaker from "./assets/filmmaker.webp";
import frozenWilds from "./assets/frozen-wilds.webp";
import hikerSea from "./assets/hiker-sea.webp";
import loftPacking from "./assets/loft-packing.webp";
import morningPacking from "./assets/morning-packing.webp";
import mountainStudio from "./assets/mountain-studio.webp";
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
    src: neonCrosswalk,
    label: "a-cam · 214 gb",
    style: "--w:140px;--x:-11%;--y:4%;--r:-9deg;--dx:-200px;--dy:-120px;--d:.15s",
  },
  {
    src: frozenWilds,
    label: "b-cam · 188 gb",
    style: "--w:130px;--x:35%;--y:3%;--r:7deg;--dx:80px;--dy:-220px;--d:.3s",
  },
  {
    src: coastRoad,
    label: "drone · 61 gb",
    style: "--w:110px;--ar:2/3;--x:-12%;--y:74%;--r:6deg;--dx:-180px;--dy:200px;--d:.45s",
  },
  {
    src: hikerSea,
    label: "audio · 2 gb",
    style: "--w:110px;--x:41%;--y:84%;--r:-12deg;--dx:120px;--dy:220px;--d:.6s",
  },
];

const failures = [
  {
    src: wrong1,
    gb: "38 GB landed",
    h: "Café Wi-Fi died",
    p: "It waited for the connection, then carried on from the same spot.",
    r: "Continued",
    rot: -3,
  },
  {
    src: wrong2,
    gb: "141 GB landed",
    h: "Laptop slept on the train",
    p: "On wake it checked what had already arrived and picked up from there.",
    r: "Continued",
    rot: 2,
  },
  {
    src: wrong3,
    gb: "220 GB landed",
    h: "Someone refreshed the tab",
    p: "Choose the same file again and it resumes. No new upload.",
    r: "Continued",
    rot: -1.5,
  },
  {
    src: wrong4,
    gb: "221 GB landed",
    h: "Left it overnight",
    p: "Sessions don't time out on you. Open the lid the next morning and it's still where you left it.",
    r: "Continued",
    rot: 2.5,
  },
  {
    src: wrong5,
    gb: "311 GB landed",
    h: "One piece arrived damaged",
    p: "Tranzfer noticed and re-sent that piece. About 100 MB, not 311 GB.",
    r: "Fixed itself",
    rot: -2,
  },
  {
    src: wrong6,
    gb: "350 GB · done",
    h: "Delivered",
    p: "Verified bit for bit. Marcus got one link and downloaded at full speed.",
    r: "Done",
    rot: 1.5,
  },
];

const steps = [
  {
    src: videoEdit,
    h: "Drop the cards",
    p: "Whole camera cards, folders, 400 GB. Drag them in and walk away.",
  },
  {
    src: loftPacking,
    h: "Close the laptop",
    p: "Real speed, real time remaining. Nothing you've already sent is sent twice.",
  },
  {
    src: filmmaker,
    h: "Send one link",
    p: "Your editor clicks and downloads. No account. The link expires and the files delete themselves.",
  },
];

const plans = [
  {
    h: "Free",
    price: "$0",
    per: "",
    items: ["100 GB per transfer", "Links live 7 days", "Resumes after any failure"],
    cta: "Start free",
    hot: false,
  },
  {
    h: "Pro",
    tag: "Most editors",
    price: "$29",
    per: "/mo",
    items: [
      "1 TB per transfer",
      "Links live 30 days",
      "Passwords and expiry you control",
      "Faster lane on busy days",
      "Delivery history",
    ],
    cta: "Start Pro",
    hot: true,
  },
  {
    h: "Studio",
    price: "$99",
    per: "/mo",
    items: [
      "No size limit",
      "Seats for the whole team",
      "A standing inbox for your regular editors",
      "Files land straight in their folder",
    ],
    cta: "Talk to us",
    hot: false,
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

  let root: HTMLDivElement | undefined;
  let pos: MousePosition | undefined;
  const tilt = () =>
    pos?.sourceType
      ? { x: pos.x / innerWidth - 0.5, y: pos.y / innerHeight - 0.5 }
      : { x: 0, y: 0 };

  const view = (
    <div ref={(el) => (root = el)} class="overflow-x-clip">
      <div class="relative mx-auto max-w-[1180px] px-7">
        <nav class="relative z-5 flex h-16 items-center justify-between border-b border-ink">
          <Brand />
          <ul class="flex list-none items-center gap-7 text-sm font-medium text-mut">
            <li class="hidden md:block">
              <a class="hover:text-ink" href="#desk">
                What survives
              </a>
            </li>
            <li class="hidden md:block">
              <a class="hover:text-ink" href="#how">
                How it works
              </a>
            </li>
            <li class="hidden md:block">
              <a class="hover:text-ink" href="#pricing">
                Pricing
              </a>
            </li>
            <li>
              <a class="hover:text-ink" href="#">
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
            "sent twice:
            <br />
            <b style="font-size:28px">zero"</b>
            <br />
            <small style="font-size:15px">sure.</small>
          </Hand>
          <Asterisk style="left:34%;bottom:6%;width:30px;height:30px" />
          <Asterisk tone="blue" style="right:-3%;top:40%;width:24px;height:24px" />
          <Hand style="left:56%;top:1%;--r:-3deg;--d:1.2s">
            day 1. 463 GB.
            <br />
            hotel wifi. let's see.
          </Hand>
          <Hand tone="blue" style="left:50%;bottom:9%;--r:-3deg;--d:1.8s">
            ↑ dropped the cards, went for dinner
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
              Never start over.
            </h1>
            <p
              class="rv mt-[26px] mb-[34px] max-w-[34ch] text-pretty text-xl leading-[1.4] font-medium text-[#3a3b40]"
              style="--d:120ms"
            >
              Hundreds of gigabytes to your editor. Wi-Fi drops, laptop sleeps, tab closes. It picks
              up where it stopped.
            </p>
            <div class="rv flex flex-wrap items-center gap-[26px]" style="--d:200ms">
              <Button>
                Send 100 GB free <ArrowIcon />
              </Button>
              <a
                class="border-b border-ink/25 pb-0.5 text-[15px] font-semibold text-ink transition-[border-color] duration-200 hover:border-ink [&_span]:inline-block [&_span]:transition-[translate] [&_span]:duration-250 [&_span]:ease-smooth [&:hover_span]:translate-x-1"
                href="#desk"
              >
                See what it survives <span>→</span>
              </a>
            </div>
          </div>

          <Uploader in={mounted()} rx={-tilt().y * 8} ry={tilt().x * 10} />
        </section>
      </div>

      <div class="ticker">
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
            09:12 wifi died.
            <br />
            here we go.
          </Hand>
          <Hand style="right:-2%;top:12%;--r:-7deg;--d:.6s;text-align:right">
            …wait. it kept going?
            <br />I didn't touch anything.
          </Hand>
          <Hand tone="blue" style="left:-9%;top:70%;--r:-5deg;--d:.8s">
            ok. this is
            <br />
            actually fine.
          </Hand>
          <div class={head}>
            <p class={mono}>One real day, one 350 GB card</p>
            <h2 class={["rv", h2]}>
              Six things went wrong.
              <br />
              <i>Nothing restarted.</i>
            </h2>
            <p class="rv mt-[18px] max-w-[52ch] text-lg text-mut" style="--d:80ms">
              Every piece of footage is saved the moment it lands. When something breaks, Tranzfer
              checks what already arrived, makes sure your file hasn't changed, and sends only
              what's missing.
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
            day 2. closed the lid
            <br />
            on purpose this time.
          </Hand>
          <div class={head}>
            <p class={mono}>How it works</p>
            <h2 class={["rv", h2]}>
              Three steps. <i>No babysitting.</i>
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

        <section class="quote relative grid grid-cols-1 items-center gap-[60px] py-20 lg:grid-cols-[1fr_1.4fr] lg:py-[120px]">
          <Hand tone="blue" style="left:38%;top:8%;--r:-6deg;--d:.7s">
            same. except mine
            <br />
            was a train.
          </Hand>
          <div class="pic rv overflow-hidden rounded-2xl shadow-[0_40px_80px_-40px_rgba(23,24,28,.6)] -rotate-3 transition-[rotate] duration-500 ease-spring hover:rotate-0">
            <img src={mountainStudio} alt="" loading="lazy" />
          </div>
          <div>
            <blockquote
              class="rv text-balance text-[clamp(28px,3.6vw,46px)] leading-[1.08] font-semibold tracking-[-0.035em] italic"
              style="--d:80ms"
            >
              "I closed the lid at 62%, got on a plane, opened it in Lisbon, and it just kept
              going."
            </blockquote>
            <cite class="rv mt-5 block text-sm text-mut not-italic" style="--d:160ms">
              Documentary DP · 1.2 TB delivered in one week
            </cite>
          </div>
        </section>

        <section id="pricing" class="relative py-20 lg:py-[120px]">
          <Ink tone="blue" style="left:33%;top:47%;width:150px;height:90px" viewBox="0 0 180 80">
            <ellipse
              cx="90"
              cy="40"
              rx="84"
              ry="32"
              style="--len:360"
              transform="rotate(-3 90 40)"
            />
          </Ink>
          <Hand tone="blue" style="left:-11%;top:56%;--r:-8deg;--d:.9s">
            $29. one redo
            <br />
            costs more →
          </Hand>
          <Hand style="right:0;top:12%;--r:4deg;--d:.5s">
            day 3. Marcus has
            <br />
            everything. <s>cancel</s>
          </Hand>
          <div class={head}>
            <p class={mono}>Pricing</p>
            <h2 class={["rv", h2]}>
              Pay for the work. <i>Not per gigabyte.</i>
            </h2>
          </div>
          <div class="plans grid grid-cols-1 items-end gap-[18px] lg:grid-cols-3">
            <For each={plans}>
              {(p, i) => (
                <div
                  class={[
                    "plan rv flex flex-col gap-[18px] rounded-[20px] p-8 transition-[translate,box-shadow,rotate] duration-350 ease-smooth",
                    p.hot
                      ? "bg-ink pb-10 text-paper shadow-[0_40px_80px_-40px_rgba(23,24,28,.9)] -rotate-[1.5deg] hover:rotate-0"
                      : "bg-panel ring-1 ring-line hover:-translate-y-1.5 hover:shadow-[0_0_0_1px_var(--color-line),0_40px_60px_-40px_rgba(23,24,28,.5)]",
                  ]}
                  style={`--d:${i() * 70}ms`}
                >
                  <h3
                    class={[
                      "flex justify-between text-[13px] font-medium",
                      p.hot ? "text-[#a9a79e]" : "text-mut",
                    ]}
                  >
                    {p.h} {p.tag && <span class="text-[#8fa1ff]">{p.tag}</span>}
                  </h3>
                  <div class="font-mono text-[52px] leading-none font-medium tracking-[-0.04em]">
                    {p.price}
                    {p.per && <small class="text-[15px] tracking-normal text-mut">{p.per}</small>}
                  </div>
                  <ul
                    class={[
                      "grid flex-1 list-none gap-[9px] p-0 text-[15px] [&_li]:before:mr-2.5 [&_li]:before:opacity-50 [&_li]:before:content-['—']",
                      p.hot ? "text-[#c9c6bc]" : "text-mut",
                    ]}
                  >
                    <For each={p.items}>{(it) => <li>{it}</li>}</For>
                  </ul>
                  <Button variant={p.hot ? "fill" : "outline"}>{p.cta}</Button>
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
            fine. you win.
            <br />
            sending B-cam.
          </Hand>
          <Still
            in
            src={morningPacking}
            label="wrap day"
            style="--w:120px;--ar:2/3;--x:2%;--y:10%;--r:-8deg"
          />
          <Still in src={nightTravel} label="pickup" style="--w:140px;--x:84%;--y:55%;--r:9deg" />
          <p class={mono}>Ready when you are</p>
          <h2 class={["rv relative z-1 mx-auto mt-3.5 mb-[30px]", h2]}>
            Send something <i>enormous.</i>
          </h2>
          <Button class="rv relative z-1" style="--d:80ms">
            Send 100 GB free <ArrowIcon />
          </Button>
        </section>
        <footer class="flex justify-between border-t border-ink pt-7 pb-[60px] text-[13px] text-mut">
          <span>© 2026 Tranzfer</span>
          <span>Built for the work between shoots.</span>
        </footer>
      </div>
    </div>
  );

  // The primitives below skip their effects under isServer, so they consume
  // hydration ids on the client only. Creating them after the JSX keeps those
  // ids past every element id, so server and client stay aligned.
  createTimer(
    () => {
      setPrev(word());
      setWord((w) => (w + 1) % words.length);
      setTimeout(() => setPrev(-1), 600);
    },
    2600,
    setInterval,
  );
  // Pointer parallax; App.css zeroes it on coarse pointers.
  pos = createMousePosition(undefined, { touch: false });
  const [observe] = createViewportObserver({ rootMargin: "-40px" });
  const reveal = observe((e) => {
    if (e.isIntersecting) e.target.classList.add("in");
  });
  createEffect(
    () => mounted(),
    (isUp) => {
      if (!isUp) return;
      for (const el of root?.querySelectorAll(".rv,.chip,.ink,.hand") ?? []) reveal(el);
    },
  );
  onSettled(() => {
    setMounted(true);
  });

  return view;
}

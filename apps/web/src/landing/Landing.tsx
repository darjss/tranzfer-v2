import { PlanId, plans } from "@tranzfer/contracts";
import type { PaidPlanId } from "@tranzfer/contracts";
import { For, Show, createSignal, onSettled, useContext } from "solid-js";
import { css, cx } from "styled-system/css";
import Uploader from "./Uploader";
import { ArrowIcon, Asterisk, Blob, Hand, Ink, Ring, Still, inkStrokes } from "./notebook";
import { RuntimeContext } from "../api/solid-effect";
import { goToCheckout } from "../dashboard/billing";
import { bytes } from "../dashboard/format";
import { button } from "../ui/Button";
import { SiteFooter, SiteHeader } from "../ui/Site";
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

// Each card is a fault the release gate injects into a real 100 GB upload
// (docs/BENCHMARKS.md). Keep the copy to what the gate proves.
const failures = [
  {
    gb: "10 GB landed",
    h: "Café Wi-Fi died",
    p: "Tranzfer waits for the connection, then retries only the parts that were in flight.",
    rot: -3,
    src: wrong1,
  },
  {
    gb: "25 GB landed",
    h: "Someone refreshed the tab",
    p: "Pick the files again. Tranzfer checks them against what already arrived and carries on.",
    rot: 2,
    src: wrong3,
  },
  {
    gb: "40 GB landed",
    h: "The browser crashed",
    p: "Reopen Tranzfer and the upload is waiting on your dashboard, every stored part still there.",
    rot: -1.5,
    src: wrong2,
  },
  {
    gb: "50 GB landed",
    h: "Left it overnight",
    p: "Upload permissions run out while you sleep. Tranzfer asks for fresh ones and keeps going.",
    rot: 2.5,
    src: wrong4,
  },
  {
    gb: "70 GB landed",
    h: "Picked the wrong file",
    p: "Same name, same size, different footage. Tranzfer notices before it mixes them up.",
    rot: -2,
    src: wrong5,
  },
  {
    gb: "100 GB · done",
    h: "Delivered",
    p: "Every part confirmed, one file assembled, and the download matches what you sent, byte for byte.",
    rot: 1.5,
    src: wrong6,
  },
];

const steps = [
  {
    h: "Drop the cards",
    p: "Drag in files or whole folders. They upload straight to storage, four parts at a time.",
    src: videoEdit,
  },
  {
    h: "Close the laptop if you must",
    p: "An interrupted upload waits on your dashboard. Pick the files again and only the missing parts go up.",
    src: loftPacking,
  },
  {
    h: "Send one link",
    p: "Your editor opens it and downloads. No account, no app. The link ends when you said it would.",
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
  fontSize: "11",
  letterSpacing: "widest",
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
  const [pricingProblem, setPricingProblem] = createSignal<string>();
  const runtime = useContext(RuntimeContext);

  // The checkout call needs a session. A signed-out visitor signs in first and
  // the dashboard carries on to checkout for this plan.
  const choose = async (plan: PaidPlanId) => {
    setPricingProblem(undefined);
    const problem = await goToCheckout(runtime, plan);
    if (problem?.tag === "Unauthorized") {
      location.assign(`/sign-in?plan=${plan}`);
    } else if (problem !== undefined) {
      setPricingProblem(problem.message);
    }
  };

  let root: HTMLDivElement | undefined;
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
      <div class={css({ marginInline: "auto", maxW: "page", pos: "relative", px: "7" })}>
        <SiteHeader>
          <ul
            class={css({
              alignItems: "center",
              color: "mut",
              display: "flex",
              fontWeight: "medium",
              gap: "7",
              listStyle: "none",
              textStyle: "sm",
            })}
          >
            <li class={css({ display: { base: "none", md: "block" } })}>
              <a class={css({ _hover: { color: "ink" } })} href="#desk">
                What it survives
              </a>
            </li>
            <li class={css({ display: { base: "none", md: "block" } })}>
              <a class={css({ _hover: { color: "ink" } })} href="#how">
                How it works
              </a>
            </li>
            <li class={css({ display: { base: "none", md: "block" } })}>
              <a class={css({ _hover: { color: "ink" } })} href="#pricing">
                Pricing
              </a>
            </li>
            <li>
              <a class={css({ _hover: { color: "ink" } })} href="/sign-in">
                Sign in
              </a>
            </li>
            <li class={css({ display: { base: "none", sm: "block" } })}>
              <a class={button({ size: "sm" })} href="/sign-in">
                Start free
              </a>
            </li>
          </ul>
        </SiteHeader>

        <section
          class={css({
            alignItems: "center",
            display: "grid",
            gap: "10",
            gridTemplateColumns: { base: "1fr", lg: "repeat(2,minmax(0,1fr))" },
            minH: { base: "0", lg: "[calc(100vh - 64px)]" },
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
            wifi died?
            <br />
            <b style="font-size:28px">resume</b>
            <br />
            <small style="font-size:15px">don't restart.</small>
          </Hand>
          <Asterisk style="left:34%;bottom:6%;width:30px;height:30px" />
          <Asterisk tone="blue" style="right:-3%;top:40%;width:24px;height:24px" />
          <Hand style="left:56%;top:1%;--r:-3deg;--d:1.2s">
            tested at 100 GB,
            <br />
            with 8 things going wrong.
          </Hand>
          <Hand tone="blue" style="left:50%;bottom:9%;--r:-3deg;--d:1.8s">
            ↑ the whole card. one link.
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
                  fontWeight: "medium",
                  lineHeight: "[1.4]",
                  maxW: "[34ch]",
                  mb: "[34px]",
                  mt: "6.5",
                  textStyle: "xl",
                  textWrap: "[pretty]",
                }),
              )}
              style="--d:120ms"
            >
              Send hundreds of gigabytes from your browser. If the Wi-Fi drops or the laptop sleeps,
              Tranzfer keeps what arrived and sends only the rest. Your editor gets one link.
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
                  "&:hover span": { translate: "[4px 0]" },
                  _hover: { borderColor: "ink" },
                  borderBottomWidth: "1px",
                  borderColor: "ink/25",
                  color: "ink",
                  fontSize: "15",
                  fontWeight: "semibold",
                  paddingBottom: "0.5",
                  transitionDuration: "normal",
                  transitionProperty: "[border-color]",
                  transitionTimingFunction: "default",
                })}
                href="#desk"
              >
                See what it survives <span>→</span>
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

      <div class={css({ marginInline: "auto", maxW: "page", pos: "relative", px: "7" })}>
        <section id="desk" class={css({ pos: "relative", py: { base: "20", lg: "30" } })}>
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
            zero bytes
            <br />
            sent twice.
          </Hand>
          <Hand tone="blue" style="left:-9%;top:70%;--r:-5deg;--d:.8s">
            all in one
            <br />
            100 GB upload.
          </Hand>
          <div class={head}>
            <p class={mono}>What it survives</p>
            <h2 class={cx("rv", h2)}>
              When a transfer breaks.
              <br />
              <i>Keep the work already done.</i>
            </h2>
            <p
              class={cx("rv", css({ color: "mut", maxW: "[52ch]", mt: "4.5", textStyle: "lg" }))}
              style="--d:80ms"
            >
              Tranzfer checks which parts already arrived, confirms your file hasn't changed, and
              sends only what's missing. Before every release we throw all of these at a single 100
              GB upload, and it has to finish with the right bytes.
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
                      paddingBottom: "4.5",
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
                        borderRadius: "photo",
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
                      fontWeight: "semibold",
                      letterSpacing: "snug",
                      lineHeight: "compact",
                      mb: "1.5",
                      mt: "4",
                      mx: "1.5",
                      textStyle: "xl",
                    })}
                  >
                    {f.h}
                  </h3>
                  <p class={css({ color: "mut", mx: "1.5", textStyle: "sm" })}>{f.p}</p>
                  <span
                    class={cx(
                      "r",
                      css({
                        color: "ok",
                        display: "inline-block",
                        fontFamily: "mono",
                        fontSize: "11",
                        letterSpacing: "label",
                        mt: "3",
                        mx: "1.5",
                        textTransform: "uppercase",
                      }),
                    )}
                  >
                    Survived in testing
                  </span>
                </article>
              )}
            </For>
          </div>
        </section>

        <section id="how" class={css({ pos: "relative", py: { base: "20", lg: "30" } })}>
          <Hand style="right:0;top:6%;--r:4deg;--d:.5s">
            made for laptops
            <br />
            that need to sleep.
          </Hand>
          <div class={head}>
            <p class={mono}>How it works</p>
            <h2 class={cx("rv", h2)}>
              From camera card <i>to editor.</i>
            </h2>
          </div>
          <div
            class={cx(
              "steps",
              css({
                display: "grid",
                gap: "4.5",
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
                      transitionProperty: "[scale,filter]",
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

        <section id="pricing" class={css({ pos: "relative", py: { base: "20", lg: "30" } })}>
          <div class={head}>
            <p class={mono}>Pricing</p>
            <h2 class={cx("rv", h2)}>
              Pay for the work. <i>Not per gigabyte.</i>
            </h2>
            <p class={css({ color: "mut", fontSize: "17", mt: "4" })}>
              Every plan includes large uploads, resume, folders and links. Paid plans add active
              transfer space and longer links. Space frees up when a delivery expires or is
              cancelled.
            </p>
          </div>
          <div
            class={css({
              alignItems: "end",
              display: "grid",
              gap: "4.5",
              gridTemplateColumns: {
                base: "1fr",
                lg: "repeat(4,minmax(0,1fr))",
                md: "repeat(2,minmax(0,1fr))",
              },
            })}
          >
            <For each={PlanId.literals}>
              {(id, i) => (
                <div
                  class={cx(
                    "rv",
                    css({
                      borderRadius: "card",
                      display: "flex",
                      flexDir: "column",
                      gap: "4.5",
                      p: "8",
                    }),
                    id === "pro"
                      ? css({ bg: "ink", color: "paper", pb: "10", shadow: "paper" })
                      : css({ bg: "panel", shadow: "ring" }),
                  )}
                  style={`--d:${i() * 70}ms`}
                >
                  <h3 class={css({ color: "mut", fontSize: "13", fontWeight: "medium" })}>
                    {plans[id].name}
                  </h3>
                  <div
                    class={css({
                      fontFamily: "mono",
                      fontSize: "[44px]",
                      fontWeight: "medium",
                      letterSpacing: "[-0.04em]",
                      lineHeight: "none",
                    })}
                  >
                    ${plans[id].monthlyUsd}
                    <Show when={id !== "free"}>
                      <small class={css({ color: "mut", fontSize: "15", letterSpacing: "normal" })}>
                        /mo
                      </small>
                    </Show>
                  </div>
                  <ul
                    class={css({
                      color: id === "pro" ? "[#c9c6bc]" : "mut",
                      display: "grid",
                      flex: "1",
                      fontSize: "15",
                      gap: "2",
                      listStyle: "none",
                      p: "0",
                    })}
                  >
                    <li>{bytes(plans[id].activeBytes)} active transfer space</li>
                    <li>Links live up to {plans[id].maxRetentionDays} days</li>
                  </ul>
                  <Show
                    when={id !== "free"}
                    fallback={
                      <a class={button({ variant: "outline" })} href="/sign-in">
                        Start free
                      </a>
                    }
                  >
                    <button
                      class={button({ variant: id === "pro" ? "fill" : "outline" })}
                      onClick={() => {
                        // Free is the only plan without a checkout.
                        if (id !== "free") {
                          void choose(id);
                        }
                      }}
                      type="button"
                    >
                      Choose {plans[id].name}
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={pricingProblem()}>
            {(problem) => (
              <p class={css({ color: "rust", mt: "4", textStyle: "sm" })} role="alert">
                {problem()}
              </p>
            )}
          </Show>
          <p class={css({ color: "mut", mt: "6", textStyle: "sm" })}>
            Billed monthly through Polar. Cancel anytime from your account; your plan runs to the
            end of the month you paid for.
          </p>
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
            your turn:
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
          <p class={mono}>20 GB free, no card</p>
          <h2
            class={cx(
              "rv",
              css({ marginInline: "auto", mb: "[30px]", mt: "3.5", pos: "relative", zIndex: 1 }),
              h2,
            )}
          >
            Send the big one. <i>Sleep anyway.</i>
          </h2>
          <a
            class={cx(css(button.raw(), { pos: "relative", zIndex: 1 }), "rv")}
            href="/sign-in"
            style="--d:80ms"
          >
            Start free <ArrowIcon />
          </a>
        </section>
        <SiteFooter />
      </div>
    </div>
  );
}

import { For } from "solid-js";
import { Button } from "../ui/Button";
import coastRoad from "./assets/coast-road.webp";
import frozenWilds from "./assets/frozen-wilds.webp";
import neonCrosswalk from "./assets/neon-crosswalk.webp";

// Visual-only hero uploader. This is a static picture of the finished state
// on purpose: the real uploader (Uppy + R2 multipart, per RELIABILITY.md)
// lands in foundation step 6 and replaces this component wholesale. Do not
// grow fake progress state here.

const files = [
  { meta: "214 GB · 1,842 clips", name: "EP04_A-Cam", thumb: neonCrosswalk },
  { meta: "188 GB · 1,204 clips", name: "EP04_B-Cam", thumb: frozenWilds },
  { meta: "61 GB · 97 clips", name: "Drone_Day2", thumb: coastRoad },
];

const ghost =
  "absolute inset-0 rounded-[20px] bg-panel ring-1 ring-line shadow-[0_30px_60px_-40px_rgba(23,24,28,.4)]";

export default function Uploader(props: { in: boolean; rx: number; ry: number }) {
  return (
    <div class="stage group/stage relative z-2 w-[min(100%,520px)] [perspective:1400px] lg:justify-self-end">
      <div
        class={[
          "stack relative transform-3d transform-[rotateX(var(--rx,0))_rotateY(var(--ry,0))] transition-transform duration-400 ease-smooth",
          { in: props.in },
        ]}
        style={{ "--rx": `${props.rx}deg`, "--ry": `${props.ry}deg` }}
      >
        <div class={[ghost, "transform-[rotate(-6deg)_translate(-18px,18px)_translateZ(-40px)]"]} />
        <div class={[ghost, "transform-[rotate(4deg)_translate(14px,10px)_translateZ(-20px)]"]} />
        <div class="card relative -rotate-2 rounded-[20px] bg-panel p-[22px] ring-1 ring-line shadow-[inset_0_1px_0_#fff,0_50px_90px_-50px_rgba(23,24,28,.55)] transition-[rotate] duration-500 ease-smooth group-hover/stage:rotate-0">
          <div class="stamp absolute -top-3.5 right-[22px] inline-flex translate-y-2 scale-[.94] items-center gap-2 rounded-full bg-linear-to-b from-white to-[#f1ede3] px-3 py-[7px] text-xs font-medium text-ink opacity-0 shadow-[inset_0_1px_0_#fff,0_0_0_1px_var(--color-line),0_10px_20px_-12px_rgba(23,24,28,.4)] [transition:translate_.6s_var(--ease-smooth)_1s,scale_.6s_var(--ease-smooth)_1s,opacity_.4s_ease_1s] before:size-3.5 before:rounded-full before:[background:conic-gradient(var(--color-blue)_0_72%,var(--color-line)_0)] before:content-[''] [.in_&]:translate-y-0 [.in_&]:scale-100 [.in_&]:opacity-100">
            Resumes on its own
          </div>
          <header class="mb-4 flex items-center justify-between">
            <div>
              <b class="font-semibold">New transfer</b>
              <small class="block text-[13px] text-mut">To Marcus · your editor in Berlin</small>
            </div>
            <span class="inline-flex items-center gap-2 text-xs font-medium text-mut before:size-1.5 before:rounded-full before:bg-ok before:shadow-[0_0_0_3px_rgba(31,122,69,.15)] before:content-['']">
              Ready
            </span>
          </header>
          <div class="relative overflow-hidden rounded-[14px] border-[1.5px] border-dashed border-[#b9b2a2] bg-[repeating-linear-gradient(45deg,transparent_0_10px,rgba(0,0,0,.015)_10px_20px)] px-[22px] py-[26px] text-center">
            <div class="ico mx-auto mb-3 grid size-14 animate-[bob_2.6s_ease-in-out_infinite] place-items-center rounded-2xl bg-ink text-white shadow-[0_16px_30px_-14px_rgba(0,0,0,.6)]">
              <svg
                class="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              </svg>
            </div>
            <b class="block font-semibold">Drop cards, folders, anything</b>
            <span class="text-[13px] text-mut">Whole camera cards welcome. 400 GB is fine.</span>
          </div>
          <div class="mt-4 grid gap-2.5">
            <For each={files}>
              {(f, i) => (
                <div
                  class="chip grid translate-x-5 rotate-2 grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl bg-white px-3 py-2.5 opacity-0 ring-1 ring-line [transition:translate_.6s_var(--ease-spring),rotate_.6s_var(--ease-spring),opacity_.4s] [transition-delay:var(--d)] [&.in]:translate-x-0 [&.in]:rotate-0 [&.in]:opacity-100"
                  style={`--d: ${0.5 + i() * 0.15}s`}
                >
                  <img class="size-11 rounded-lg object-cover" src={f.thumb} alt="" />
                  <div>
                    <b class="block text-sm font-semibold">{f.name}</b>
                    <small class="font-mono text-xs text-mut">{f.meta}</small>
                  </div>
                  <span class="grid size-[22px] place-items-center rounded-full bg-ok/12 text-ok">
                    <svg
                      class="size-3"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="m2 6 3 3 5-6" />
                    </svg>
                  </span>
                </div>
              )}
            </For>
          </div>
          <footer class="mt-[18px] flex items-center justify-between border-t border-line pt-4">
            <small class="font-mono text-[13px] text-mut">463 GB · link lives 7 days</small>
            <Button size="sm">Send it</Button>
          </footer>
        </div>
      </div>
    </div>
  );
}

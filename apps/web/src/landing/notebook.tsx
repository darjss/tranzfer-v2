import type { ParentProps } from "solid-js";

// Margin scribbles for the notebook layer. Positioning stays inline CSS so
// each note is tuned where it is used; `.ink`/`.hand` reveal on scroll.

type Tone = "" | "blue" | "red";

const tone = { "": "text-ink", blue: "text-blue", red: "text-rust" } satisfies Record<Tone, string>;

export function Hand(props: ParentProps<{ tone?: Tone; style: string }>) {
  return (
    <span
      class={[
        "hand pointer-events-none absolute z-3 hidden translate-y-1.5 rotate-[var(--r,-4deg)] font-hand text-[22px] leading-[1.1] font-semibold opacity-0 transition-[opacity,translate] duration-500 ease-smooth [transition-delay:var(--d,0s)] lg:block [&.in]:translate-y-0 [&.in]:opacity-55 [&_s]:opacity-70 [&_s]:decoration-2",
        tone[props.tone ?? ""],
      ]}
      style={props.style}
    >
      {props.children}
    </span>
  );
}

export function Ink(props: ParentProps<{ tone?: Tone; style: string; viewBox: string }>) {
  return (
    <svg
      class={[
        "ink pointer-events-none absolute z-3 hidden overflow-visible opacity-80 lg:block *:fill-none *:stroke-current *:stroke-[2.2] *:transition-[stroke-dashoffset] *:duration-[1.3s] *:ease-[cubic-bezier(.6,0,.2,1)] *:[stroke-dasharray:var(--len,600)] *:[stroke-dashoffset:var(--len,600)] *:[stroke-linecap:round] *:[stroke-linejoin:round] *:[transition-delay:var(--d,0s)] [&.in>*]:[stroke-dashoffset:0]",
        tone[props.tone ?? ""],
      ]}
      style={props.style}
      viewBox={props.viewBox}
    >
      {props.children}
    </svg>
  );
}

export const Asterisk = (props: { tone?: Tone; style: string }) => (
  <Ink tone={props.tone} style={props.style} viewBox="0 0 34 34">
    <path d="M17 3v28M4 10l26 14M30 10 4 24" style={{ "--d": "1.1s", "--len": "120" }} />
  </Ink>
);

export const Ring = (props: { style: string }) => (
  <div class="halo hidden lg:block" style={props.style} />
);
export const Blob = (props: { style: string }) => (
  <div
    class="pointer-events-none absolute z-0 rounded-full opacity-35 blur-[60px]"
    style={props.style}
  />
);

export function Still(props: { src: string; label: string; style: string; in?: boolean }) {
  return (
    <div
      class={[
        "still pointer-events-none absolute top-(--y) left-(--x) w-(--w) aspect-[var(--ar,3/2)] overflow-hidden rounded-md bg-white px-1.5 pt-1.5 pb-[22px] shadow-[0_30px_60px_-30px_rgba(23,24,28,.55),0_0_0_1px_rgba(0,0,0,.06)] rotate-(--r) transform-[translate(var(--dx,0),var(--dy,0))_scale(.6)] opacity-0 [transition:transform_1.1s_var(--ease-spring),opacity_.6s_ease] [transition-delay:var(--d)] [animation-delay:var(--d)] after:absolute after:bottom-[5px] after:left-2 after:font-mono after:text-[9px] after:tracking-[.08em] after:uppercase after:text-mut after:content-[attr(data-l)] [&.in]:animate-[drift_7s_ease-in-out_infinite] [&.in]:opacity-100 [&.in]:transform-[translate(0,0)_scale(1)]",
        { in: props.in === true },
      ]}
      data-l={props.label}
      style={props.style}
    >
      <img
        src={props.src}
        alt=""
        class="size-full rounded-[3px] object-cover saturate-[.9] contrast-[1.05]"
      />
    </div>
  );
}

export const ArrowIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

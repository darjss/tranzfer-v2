// Nav logo: two open frames, one arrow, underline draws on load (keyframes
// `draw`/`redraw` live in landing.css). Source of truth for the mark is
// docs/design/logo/tranzfer-mark.svg.

const bar = "bar [stroke-dasharray:1] [stroke-dashoffset:1] group-hover:[animation-name:redraw]";
const slow = [bar, "[animation:draw_.5s_var(--ease-smooth)_forwards]"];
const quick = [bar, "[animation:draw_.25s_var(--ease-smooth)_.4s_forwards]"];
const late = [bar, "[animation:draw_.25s_var(--ease-smooth)_.7s_forwards]"];

export default function Brand() {
  return (
    <a
      class="brand group inline-flex items-center gap-[9px] text-xl font-bold tracking-[-0.02em] text-ink"
      href="/"
      aria-label="Tranzfer"
    >
      <svg
        class="mt-0.5 size-[34px]"
        viewBox="0 0 32 32"
        fill="none"
        stroke-width="2.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M14 14.5A3.5 3.5 0 0 0 10.5 11h-5A3.5 3.5 0 0 0 2 14.5v5A3.5 3.5 0 0 0 5.5 23h5a3.5 3.5 0 0 0 3.5-3.5"
          stroke="var(--color-blue)"
          stroke-opacity=".4"
        />
        <path
          d="M18 17.5a3.5 3.5 0 0 0 3.5 3.5h5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 26.5 9h-5A3.5 3.5 0 0 0 18 12.5"
          stroke="var(--color-blue)"
        />
        <path class={slow} pathLength="1" d="M6 16h20" stroke="currentColor" />
        <path class={quick} pathLength="1" d="M23.2 13.2 26 16l-2.8 2.8" stroke="currentColor" />
      </svg>
      <span class="word relative leading-none">
        tranzfer
        <svg
          class="absolute -bottom-[3px] -left-px h-1.5 w-full overflow-visible"
          viewBox="0 0 60 6"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            class={late}
            pathLength="1"
            d="M1 4.6c10-1.6 22-2.4 36-2.2"
            stroke="var(--color-blue)"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </span>
    </a>
  );
}

import { For, Show, createMemo, createSignal } from "solid-js";
import { css, cx } from "styled-system/css";
import { checked, quote } from "./prices";
import { eyebrow } from "../landing/styles";

// Drag the size and how often; every service's monthly price moves with it.

const sizes = [1, 2, 5, 10, 20, 50, 100, 200, 300, 500, 1000, 2000, 3000];
const showSize = (gb: number) => (gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);
const money = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });
const whole = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});
// Cents only where they matter.
const usd = (price: number) => (price >= 100 || price % 1 === 0 ? whole : money).format(price);

const range = css({
  "&::-moz-range-thumb": { bg: "blue", border: "none", borderRadius: "full", boxSize: "6" },
  "&::-webkit-slider-thumb": {
    appearance: "none",
    bg: "blue",
    borderRadius: "full",
    boxSize: "6",
    cursor: "grab",
    shadow: "[0 4px 12px -2px rgba(39,64,196,.6)]",
  },
  appearance: "none",
  bg: "ink/10",
  borderRadius: "full",
  cursor: "pointer",
  h: "2",
  w: "full",
});

const label = css({
  alignItems: "baseline",
  display: "flex",
  justifyContent: "space-between",
  mb: "3",
});
const value = css({
  fontFamily: "mono",
  fontSize: "[28px]",
  fontWeight: "medium",
  letterSpacing: "tight",
});

export default function PriceCalculator() {
  const [sizeIndex, setSizeIndex] = createSignal(6, { name: "calculator-size" });
  const [count, setCount] = createSignal(4, { name: "calculator-count" });
  const [live, setLive] = createSignal(1, { name: "calculator-live" });
  const size = () => sizes[sizeIndex()] ?? 1;
  const quotes = createMemo(() => quote(size(), count(), live()), {
    name: "calculator-quotes",
  });
  const most = () => Math.max(1, ...quotes().map((q) => q.price ?? 0));
  const cheapest = () =>
    Math.min(...quotes().flatMap((q) => (q.price === undefined ? [] : [q.price])));

  return (
    <section
      class={css({
        bg: "panel",
        borderRadius: "card",
        p: { base: "6", md: "10" },
        shadow: "paper",
      })}
    >
      <p class={eyebrow}>Price check</p>
      <h2
        class={css({
          fontSize: "[clamp(28px,3.4vw,44px)]",
          fontWeight: "semibold",
          letterSpacing: "[-0.03em]",
          mt: "2",
        })}
      >
        What would you pay elsewhere?
      </h2>

      <div
        class={css({
          display: "grid",
          gap: "8",
          gridTemplateColumns: { base: "1fr", md: "repeat(3,1fr)" },
          mt: "8",
        })}
      >
        <label>
          <span class={label}>
            <span class={css({ fontWeight: "medium" })}>Delivery size</span>
            <span class={value}>{showSize(size())}</span>
          </span>
          <input
            aria-valuetext={showSize(size())}
            class={range}
            max={sizes.length - 1}
            min={0}
            onInput={(event) => {
              setSizeIndex(Number(event.currentTarget.value));
            }}
            step={1}
            type="range"
            value={sizeIndex()}
          />
        </label>
        <label>
          <span class={label}>
            <span class={css({ fontWeight: "medium" })}>Deliveries a month</span>
            <span class={value}>{count()}</span>
          </span>
          <input
            class={range}
            max={30}
            min={1}
            onInput={(event) => {
              setCount(Number(event.currentTarget.value));
            }}
            step={1}
            type="range"
            value={count()}
          />
        </label>
        <label>
          <span class={label}>
            <span class={css({ fontWeight: "medium" })}>Live at the same time</span>
            <span class={value}>{live()}</span>
          </span>
          <input
            class={range}
            max={10}
            min={1}
            onInput={(event) => {
              setLive(Number(event.currentTarget.value));
            }}
            step={1}
            type="range"
            value={live()}
          />
        </label>
      </div>
      <p class={css({ color: "mut", fontSize: "15", mt: "4", textWrap: "pretty" })}>
        That's {showSize(size() * count())} a month. Tranzfer needs room for{" "}
        {showSize(size() * live())} at once, because a link counts until it expires or you cancel
        it.
      </p>

      <div class={css({ display: "grid", gap: "3", mt: "8" })} aria-live="polite">
        <For each={quotes()}>
          {(q) => (
            <div
              class={cx(
                css({
                  alignItems: "center",
                  borderRadius: "xl",
                  columnGap: "5",
                  display: "grid",
                  gridTemplateColumns: { base: "1fr auto", md: "140px 1fr 110px" },
                  px: "4",
                  py: "3.5",
                  rowGap: "2",
                }),
                q.id === "tranzfer"
                  ? css({ bg: "ink", color: "paper" })
                  : css({ bg: "white", shadow: "ring" }),
              )}
            >
              <div>
                <b class={css({ fontWeight: "semibold" })}>{q.name}</b>
                <small class={css({ display: "block", fontSize: "13", opacity: 0.7 })}>
                  {q.plan}
                </small>
              </div>
              <div
                class={css({
                  gridColumn: { base: "1 / -1", md: "auto" },
                  gridRow: { base: "2", md: "auto" },
                })}
              >
                <div
                  class={css({
                    bg: q.id === "tranzfer" ? "white/15" : "ink/8",
                    borderRadius: "full",
                    h: "2",
                    overflow: "hidden",
                  })}
                >
                  <div
                    class={css({
                      bg: q.id === "tranzfer" ? "[#8fa1ff]" : "ink/40",
                      borderRadius: "full",
                      h: "full",
                      transformOrigin: "left",
                      transitionDuration: "[450ms]",
                      transitionProperty: "[scale]",
                      transitionTimingFunction: "[cubic-bezier(.23,1,.32,1)]",
                    })}
                    style={{ scale: `${Math.max(0.02, (q.price ?? 0) / most())} 1` }}
                  />
                </div>
                <small class={css({ display: "block", fontSize: "13", mt: "1.5", opacity: 0.75 })}>
                  {q.resume} ·{" "}
                  <a class={css({ textDecoration: "underline" })} href={q.source}>
                    source
                  </a>
                </small>
              </div>
              <div class={css({ textAlign: "right" })}>
                <Show
                  when={q.price}
                  keyed
                  fallback={
                    <Show
                      when={q.price === 0}
                      fallback={<span class={css({ fontSize: "13" })}>Too big</span>}
                    >
                      <span class={value}>$0</span>
                    </Show>
                  }
                >
                  {(price) => <span class={value}>{usd(price)}</span>}
                </Show>
                <Show when={q.price !== undefined && q.price === cheapest()}>
                  <small
                    class={css({
                      color: q.id === "tranzfer" ? "[#8fa1ff]" : "ok",
                      display: "block",
                      fontSize: "[12px]",
                    })}
                  >
                    cheapest
                  </small>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      <details class={css({ color: "mut", fontSize: "[14px]", mt: "6" })}>
        <summary class={css({ cursor: "pointer" })}>
          Monthly USD on monthly billing, checked {checked}.
        </summary>
        <p class={css({ mt: "2", textWrap: "pretty" })}>
          Prices come from each company's own pricing page, linked on its row. WeTransfer and
          Dropbox don't publish comparable USD prices without an account, so they're left out.
          Prices change, so check theirs before you decide.
        </p>
      </details>
    </section>
  );
}

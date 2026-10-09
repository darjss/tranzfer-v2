import { PlanId, plans } from "@tranzfer/contracts";
import { For, Show, createMemo, createSignal } from "solid-js";
import { css } from "styled-system/css";
import { bytes } from "../dashboard/format";
import { eyebrow } from "../landing/styles";

// File size and upload speed in, time out. Everything runs in the browser.

const GB = 1e9;

/** Seconds to move `size` bytes at `mbps` megabits a second with the line running flat out. */
export const uploadSeconds = (size: number, mbps: number) => (size * 8) / (mbps * 1e6);

/** Real uploads rarely hold the advertised speed; plan with this share of it. */
export const planningShare = 0.8;

/** "11 h 7 min", "26 min 40 s", "3 days 2 h". */
export const duration = (seconds: number) => {
  if (seconds < 3600) {
    const s = Math.max(1, Math.round(seconds));
    const m = Math.floor(s / 60);
    if (m === 0) {
      return `${s} s`;
    }
    return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} s`;
  }
  if (seconds >= 48 * 3600) {
    const hours = Math.round(seconds / 3600);
    return `${Math.floor(hours / 24)} days ${hours % 24} h`;
  }
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const presets = [20, 50, 100, 500].map((mbps) => ({ gb: 100, mbps }));

const field = css({
  _focusVisible: { outlineColor: "blue", outlineStyle: "solid", outlineWidth: "2px" },
  bg: "white",
  borderRadius: "xl",
  fontFamily: "mono",
  fontSize: "22",
  minW: "0",
  px: "4",
  py: "3",
  shadow: "ring",
  w: "full",
});

const fieldLabel = css({ display: "block", fontWeight: "medium", mb: "2" });

export default function UploadTimeCalculator() {
  // Raw text, so a half-typed or cleared field stays as the person left it.
  const [size, setSize] = createSignal("100", { name: "upload-size" });
  const [unit, setUnit] = createSignal<"GB" | "TB">("GB", { name: "upload-unit" });
  const [speed, setSpeed] = createSignal("50", { name: "upload-speed" });

  const result = createMemo(
    () => {
      const total = Number(size()) * (unit() === "TB" ? 1000 : 1) * GB;
      const mbps = Number(speed());
      return total > 0 && mbps > 0
        ? {
            full: duration(uploadSeconds(total, mbps)),
            gbPerHour: ((mbps * 1e6) / 8 / GB) * 3600,
            mbPerSecond: mbps / 8,
            // The smallest plan that holds it all live at once.
            plan: PlanId.literals.map((id) => plans[id]).find((p) => p.activeBytes >= total),
            planned: duration(uploadSeconds(total, mbps * planningShare)),
          }
        : undefined;
    },
    { name: "upload-result" },
  );

  return (
    <section
      aria-labelledby="calculator-title"
      class={css({
        bg: "panel",
        borderRadius: "card",
        p: { base: "6", md: "10" },
        shadow: "paper",
      })}
    >
      <p class={eyebrow} id="calculator-title">
        Upload time calculator
      </p>
      <div
        class={css({
          display: "grid",
          gap: "6",
          gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" },
          mt: "5",
        })}
      >
        <div>
          <label class={fieldLabel} for="upload-size">
            File size
          </label>
          <div class={css({ display: "flex", gap: "2" })}>
            <input
              class={field}
              id="upload-size"
              inputmode="decimal"
              min="0"
              onInput={(event) => {
                setSize(event.currentTarget.value);
              }}
              step="any"
              type="number"
              value={size()}
            />
            <select
              aria-label="Size unit"
              class={css({
                bg: "white",
                borderRadius: "xl",
                cursor: "pointer",
                fontFamily: "mono",
                fontSize: "17",
                px: "3",
                shadow: "ring",
              })}
              onChange={(event) => {
                setUnit(event.currentTarget.value === "TB" ? "TB" : "GB");
              }}
              value={unit()}
            >
              <option value="GB">GB</option>
              <option value="TB">TB</option>
            </select>
          </div>
        </div>
        <div>
          <label class={fieldLabel} for="upload-speed">
            Upload speed in Mbps
          </label>
          <input
            class={field}
            id="upload-speed"
            inputmode="decimal"
            min="0"
            onInput={(event) => {
              setSpeed(event.currentTarget.value);
            }}
            step="any"
            type="number"
            value={speed()}
          />
        </div>
      </div>

      <div class={css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "4" })}>
        <For each={presets}>
          {(preset) => (
            <button
              aria-pressed={
                size() === String(preset.gb) && unit() === "GB" && speed() === String(preset.mbps)
                  ? "true"
                  : "false"
              }
              class={css({
                "&[aria-pressed=true]": { bg: "ink", color: "paper" },
                _hover: { color: "ink" },
                bg: "white",
                borderRadius: "full",
                color: "[#3a3b40]",
                cursor: "pointer",
                fontSize: "13",
                px: "3.5",
                py: "1.5",
                shadow: "ring",
              })}
              onClick={() => {
                setSize(String(preset.gb));
                setUnit("GB");
                setSpeed(String(preset.mbps));
              }}
              type="button"
            >
              {preset.gb} GB at {preset.mbps} Mbps
            </button>
          )}
        </For>
      </div>

      <div
        aria-live="polite"
        class={css({ borderColor: "line", borderTopWidth: "1px", mt: "8", pt: "6" })}
      >
        <Show
          when={result()}
          fallback={<p class={css({ color: "mut" })}>Enter a size and a speed above zero.</p>}
        >
          {(r) => (
            <>
              <p class={css({ color: "mut", fontSize: "15" })}>At full speed</p>
              <p
                class={css({
                  fontFamily: "mono",
                  fontSize: "[clamp(34px,5vw,52px)]",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: "medium",
                  letterSpacing: "tight",
                  lineHeight: "none",
                  mt: "1",
                })}
              >
                {r().full}
              </p>
              <p class={css({ fontSize: "17", mt: "4" })}>
                Plan for <strong class={css({ fontWeight: "semibold" })}>{r().planned}</strong>.
                That's the same upload at {Math.round(planningShare * 100)}% of your speed, which is
                closer to what a real connection holds for hours.
              </p>
              <p class={css({ color: "mut", fontSize: "15", mt: "3" })}>
                {speed()} Mbps is{" "}
                {r().mbPerSecond.toLocaleString("en-US", { maximumFractionDigits: 2 })} MB/s, or
                about {r().gbPerHour.toLocaleString("en-US", { maximumFractionDigits: 1 })} GB an
                hour.{" "}
                <Show
                  when={r().plan}
                  fallback={`That's more than Tranzfer's largest plan holds at once, ${bytes(plans.studio.activeBytes)}.`}
                >
                  {(plan) =>
                    plan().monthlyUsd === 0
                      ? "That fits Tranzfer's free plan."
                      : `On Tranzfer that fits ${plan().name}, $${plan().monthlyUsd} a month.`
                  }
                </Show>
              </p>
            </>
          )}
        </Show>
      </div>
    </section>
  );
}

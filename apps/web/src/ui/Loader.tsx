import { For } from "solid-js";
import { css } from "styled-system/css";
import "./loader.css";

/** Five lines to cycle through while something loads; loader.css times five. */
export type Quips = readonly [string, string, string, string, string];

export const dashboardQuips: Quips = [
  "Warming up the pipes…",
  "Counting your gigabytes…",
  "Finding where you left off…",
  "Bribing the Wi-Fi…",
  "Almost. Probably.",
];

export const linkQuips: Quips = [
  "Unwrapping your delivery…",
  "Checking it's all there…",
  "Dusting off the files…",
  "Looking for the good bits…",
  "Nearly. Hold on.",
];

/** A shuffling deck of cards and a rotating line. Decorative; announces once. */
export default function Loader(props: { quips: Quips }) {
  return (
    <div
      class={css({ alignItems: "center", display: "flex", flexDir: "column", gap: "5", py: "6" })}
      role="status"
    >
      <div class="loader-deck" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span class={css({ srOnly: true })}>Loading</span>
      <div class="loader-quips" aria-hidden="true">
        <For each={props.quips}>
          {(quip, i) => (
            <span
              class={css({ color: "mut", fontSize: "15", textAlign: "center" })}
              style={`--i:${i()}`}
            >
              {quip}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

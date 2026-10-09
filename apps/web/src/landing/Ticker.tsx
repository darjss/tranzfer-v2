import { For } from "solid-js";

// Made-up deliveries scrolling past, to set the scale.
const ticker = [
  ["EP04_A-Cam", "214 GB → Berlin"],
  ["Coast_Film", "350 GB → Lisbon"],
  ["River_Below", "96 GB → Ulaanbaatar"],
  ["Studio_Session", "286 GB → New York"],
  ["Travel_EP03", "402 GB → Seoul"],
  ["Wedding_Day2", "130 GB → Melbourne"],
];

export default function Ticker() {
  return (
    <div class="ticker" aria-hidden="true">
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
  );
}

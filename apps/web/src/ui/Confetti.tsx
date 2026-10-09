import { For } from "solid-js";
import "./confetti.css";

const colors = ["#2740c4", "#c8412b", "#1f7a45", "#e9c46a", "#8fa1ff", "#17181c"];

// Twelve bits on fixed, hand-picked paths: same burst every time, no randomness.
const bits = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const reach = 70 + (i % 3) * 22;
  return {
    color: colors[i % colors.length],
    delay: `${(i % 4) * 25}ms`,
    rotate: `${(i % 2 === 0 ? 1 : -1) * (220 + i * 30)}deg`,
    x: `${Math.round(Math.cos(angle) * reach)}px`,
    y: `${Math.round(Math.sin(angle) * reach * 0.7 + 40)}px`,
  };
});

/** A little celebratory burst, centered on its positioned parent. */
export default function Confetti() {
  return (
    <span class="confetti" aria-hidden="true">
      <For each={bits}>
        {(bit) => (
          <i
            style={{
              "--c": bit.color,
              "--d": bit.delay,
              "--r": bit.rotate,
              "--x": bit.x,
              "--y": bit.y,
            }}
          />
        )}
      </For>
    </span>
  );
}

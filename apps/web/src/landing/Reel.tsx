import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { button } from "../ui/Button";
import "./reel.css";

// The hero card, playing its own disaster on a loop (reel.css has the
// timeline). Decorative: screen readers get one sentence.

const statuses = [
  { dot: "blue", text: "Sending" },
  { dot: "rust", text: "Wi-Fi died. Waiting it out." },
  { dot: "ok", text: "Back. Picking up at 63%." },
  { dot: "mut", text: "Laptop asleep. Nothing's lost." },
  { dot: "blue", text: "Awake. Carrying on." },
  { dot: "ok", text: "Delivered. Marcus has it." },
] as const;

const log = [
  ["02:58", "Wi-Fi died at 63%. Kept every piece."],
  ["03:04", "Back online. Carried on."],
  ["03:31", "Lid closed. Waited."],
  ["07:12", "Delivered. Same file, every byte."],
] as const;

const dot = {
  blue: css({ bg: "blue" }),
  mut: css({ bg: "mut" }),
  ok: css({ bg: "ok" }),
  rust: css({ bg: "rust" }),
};

export default function Reel() {
  return (
    <div
      role="img"
      aria-label="A 463 GB upload loses Wi-Fi at 63%, waits, survives the laptop sleeping, and gets delivered."
      class={cx("reel", css({ pos: "relative", w: "[min(100%,540px)]", zIndex: 2 }))}
    >
      <div
        aria-hidden="true"
        class={css({
          bg: "panel",
          borderRadius: "card",
          inset: "0",
          pos: "absolute",
          shadow: "paperGhost",
          transform: "[rotate(4deg) translate(14px,10px)]",
        })}
      />
      <div
        aria-hidden="true"
        class={cx(
          "reel-card",
          css({
            bg: "panel",
            borderRadius: "card",
            overflow: "hidden",
            p: "6",
            pos: "relative",
            rotate: "[-2deg]",
            shadow: "paper",
          }),
        )}
      >
        <header
          class={css({ alignItems: "baseline", display: "flex", justifyContent: "space-between" })}
        >
          <div>
            <b class={css({ fontWeight: "semibold", textStyle: "lg" })}>EP04 dailies</b>
            <small class={css({ color: "mut", display: "block", fontSize: "13" })}>
              463 GB · to Marcus, editing in Berlin
            </small>
          </div>
          <span
            class={cx(
              "reel-pct",
              css({
                fontFamily: "mono",
                fontSize: "[34px]",
                fontWeight: "medium",
                letterSpacing: "tight",
              }),
            )}
          />
        </header>

        <div
          class={cx(
            "reel-bar",
            css({ bg: "ink/8", borderRadius: "full", h: "2.5", mt: "4", overflow: "hidden" }),
          )}
        >
          <i />
        </div>

        <div class={cx("reel-status", css({ display: "grid", mt: "3.5" }))}>
          <For each={statuses}>
            {(status, i) => (
              <span
                class={css({
                  alignItems: "center",
                  display: "flex",
                  fontWeight: "medium",
                  gap: "2",
                  textStyle: "sm",
                })}
                style={`--k: reel-s${i() + 1}`}
              >
                <i
                  class={cx(
                    css({ borderRadius: "full", boxSize: "2", flexShrink: 0 }),
                    dot[status.dot],
                  )}
                />
                {status.text}
              </span>
            )}
          </For>
        </div>

        <ul
          class={cx(
            "reel-log",
            css({
              borderColor: "line",
              borderTopWidth: "1px",
              display: "grid",
              fontFamily: "mono",
              fontSize: "[12px]",
              gap: "1.5",
              listStyle: "none",
              minH: "[92px]",
              mt: "4",
              pt: "4",
            }),
          )}
        >
          <For each={log}>
            {([time, line], i) => (
              <li
                class={css({ color: "mut", display: "flex", gap: "3" })}
                style={`--k: reel-l${i() + 1}`}
              >
                <span class={css({ color: "ink/40" })}>{time}</span>
                {line}
              </li>
            )}
          </For>
        </ul>

        <footer
          class={css({
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            mt: "4",
          })}
        >
          <small class={css({ color: "mut", fontFamily: "mono", fontSize: "[12px]" })}>
            link lives 7 days
          </small>
          <span class={cx("reel-copy", button({ size: "sm" }))}>Copy link</span>
        </footer>

        <div
          class={cx(
            "reel-night",
            css({
              alignItems: "center",
              bg: "[rgba(23,24,28,.78)]",
              color: "paper",
              display: "flex",
              flexDir: "column",
              fontFamily: "hand",
              fontSize: "[34px]",
              gap: "1",
              inset: "0",
              justifyContent: "center",
              pos: "absolute",
            }),
          )}
        >
          <div>
            <span>z</span>
            <span>z</span>
            <span>z</span>
          </div>
          <small class={css({ fontSize: "[20px]", opacity: 0.8 })}>lid closed. pieces safe.</small>
        </div>
      </div>
    </div>
  );
}

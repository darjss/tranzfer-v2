import { Toaster } from "@trev.zip/solid-toast";
import type { ToastType } from "@trev.zip/solid-toast";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { css, cx } from "styled-system/css";
import PhCheckBold from "~icons/ph/check-bold";
import PhCircleNotchBold from "~icons/ph/circle-notch-bold";
import PhInfoBold from "~icons/ph/info-bold";
import PhWarningBold from "~icons/ph/warning-bold";
import PhXBold from "~icons/ph/x-bold";

// The app's notifications. Load this module with `import("../ui/Toasts")` from
// browser-only code, never statically: the package exports its server build
// only under the `node` condition, so the Worker bundle would get the browser
// build and crash the prerender. The library owns stacking, timers, swipe and
// the live region; this file owns how a toast looks.
export { toaster } from "@trev.zip/solid-toast";

const badge = css({
  "& svg": { boxSize: "3.5" },
  borderRadius: "full",
  boxSize: "7",
  display: "grid",
  flexShrink: 0,
  placeItems: "center",
});

const tone: Record<ToastType, { icon: () => JSX.Element; class: string }> = {
  error: { class: css({ bg: "rust/12", color: "rust" }), icon: () => <PhXBold /> },
  info: { class: css({ bg: "blue/10", color: "blue" }), icon: () => <PhInfoBold /> },
  loading: {
    class: css({
      "& svg": { animation: "[spin .8s linear infinite]" },
      bg: "blue/10",
      color: "blue",
    }),
    icon: () => <PhCircleNotchBold />,
  },
  success: { class: css({ bg: "ok/12", color: "ok" }), icon: () => <PhCheckBold /> },
  warning: {
    class: css({ bg: "[rgba(200,140,20,.14)]", color: "[#9a6a00]" }),
    icon: () => <PhWarningBold />,
  },
};

export default function Toasts() {
  return (
    <Toaster
      position="bottom-right"
      gap={10}
      visibleToasts={3}
      classes={{
        dismiss: css({
          _hover: { color: "ink" },
          color: "mut",
          fontSize: "13",
          pos: "absolute",
          right: "3",
          top: "3",
        }),
        toast: css({
          bg: "panel",
          borderRadius: "xl",
          color: "ink",
          fontFamily: "sans",
          overflow: "hidden",
          shadow:
            "[inset 0 1px 0 #fff,0 0 0 1px var(--colors-line),0 24px 48px -24px rgba(23,24,28,.45)]",
        }),
      }}
      dismissContent={<PhXBold aria-hidden="true" class={css({ boxSize: "3.5" })} />}
      renderToast={(toast, { remainingPercent, runAction }) => (
        <div class={css({ display: "flex", gap: "3", pl: "4", pr: "10", py: "3.5" })}>
          <span class={cx(badge, tone[toast.type].class)} aria-hidden="true">
            {tone[toast.type].icon()}
          </span>
          <div class={css({ minW: "0" })}>
            <p class={css({ fontWeight: "semibold", lineHeight: "snug", textStyle: "sm" })}>
              {toast.title}
            </p>
            <Show when={toast.description}>
              {(description) => (
                <p class={css({ color: "mut", fontSize: "13", mt: "0.5", textWrap: "pretty" })}>
                  {description()}
                </p>
              )}
            </Show>
            <Show when={toast.action}>
              {(action) => (
                <button
                  class={css({
                    _hover: { textDecoration: "underline" },
                    color: "blue",
                    fontSize: "13",
                    fontWeight: "semibold",
                    mt: "1.5",
                  })}
                  onClick={runAction}
                  type="button"
                >
                  {action().label}
                </button>
              )}
            </Show>
          </div>
          <Show when={remainingPercent() !== undefined}>
            <span
              aria-hidden="true"
              class={css({
                bg: "ink/12",
                bottom: "0",
                h: "[2px]",
                left: "0",
                pos: "absolute",
                transformOrigin: "left",
                w: "full",
              })}
              style={{ scale: `${(remainingPercent() ?? 0) / 100} 1` }}
            />
          </Show>
        </div>
      )}
    />
  );
}

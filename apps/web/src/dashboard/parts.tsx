import { createSignal, onCleanup, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { css, cx } from "styled-system/css";

import PhArrowUpBold from "~icons/ph/arrow-up-bold";
import PhBrowsersBold from "~icons/ph/browsers-bold";
import PhCheckBold from "~icons/ph/check-bold";
import PhCircleNotchBold from "~icons/ph/circle-notch-bold";
import PhClockBold from "~icons/ph/clock-bold";
import PhCopyBold from "~icons/ph/copy-bold";
import PhFileArrowUpBold from "~icons/ph/file-arrow-up-bold";
import PhHourglassMediumBold from "~icons/ph/hourglass-medium-bold";
import PhLinkBreakBold from "~icons/ph/link-break-bold";
import PhWarningBold from "~icons/ph/warning-bold";
import PhLockBold from "~icons/ph/lock-bold";
import PhWifiSlashBold from "~icons/ph/wifi-slash-bold";
import PhXBold from "~icons/ph/x-bold";

import type { Delivery, DeliveryId } from "@tranzfer/contracts";

import { Button } from "../ui/Button";
import type { Kind } from "./format";

type Tone = "amber" | "blue" | "mut" | "ok" | "rust";

const toneOf: Record<Kind, Tone> = {
  cancelled: "mut",
  elsewhere: "blue",
  expired: "mut",
  failed: "rust",
  finishing: "blue",
  interrupted: "rust",
  moving: "blue",
  needsFile: "amber",
  paused: "amber",
  ready: "ok",
  starting: "blue",
};

export const toneText: Record<Tone, string> = {
  amber: css({ color: "amber" }),
  blue: css({ color: "blue" }),
  mut: css({ color: "mut" }),
  ok: css({ color: "ok" }),
  rust: css({ color: "rust" }),
};

const toneDisc: Record<Tone, string> = {
  amber: css({ bg: "amber/12", color: "amber" }),
  blue: css({ bg: "blue/10", color: "blue" }),
  mut: css({ bg: "ink/6", color: "mut" }),
  ok: css({ bg: "ok/12", color: "ok" }),
  rust: css({ bg: "rust/10", color: "rust" }),
};

const toneBar: Record<Tone, string> = {
  amber: css({ bg: "amber" }),
  blue: css({ bg: "blue" }),
  mut: css({ bg: "mut/40" }),
  ok: css({ bg: "ok" }),
  rust: css({ bg: "rust" }),
};

export const kindText = (kind: Kind) => toneText[toneOf[kind]];

const icon = css({ boxSize: "[14px]" });

const glyphs: Record<Kind, () => JSX.Element> = {
  cancelled: () => <PhXBold class={icon} />,
  elsewhere: () => <PhBrowsersBold class={icon} />,
  expired: () => <PhClockBold class={icon} />,
  failed: () => <PhWarningBold class={icon} />,
  finishing: () => <PhHourglassMediumBold class={icon} />,
  interrupted: () => <PhLinkBreakBold class={icon} />,
  moving: () => <PhArrowUpBold class={icon} />,
  needsFile: () => <PhFileArrowUpBold class={icon} />,
  paused: () => <PhWifiSlashBold class={icon} />,
  ready: () => <PhCheckBold class={icon} />,
  starting: () => (
    <PhCircleNotchBold class={cx(icon, css({ _motionSafe: { animation: "spin" } }))} />
  ),
};

/** A shape per state, so status never rests on color alone. */
export function KindIcon(props: { kind: Kind; class?: string }) {
  return (
    <span
      aria-hidden="true"
      data-kind={props.kind}
      class={cx(
        css({
          borderRadius: "full",
          boxSize: "7",
          display: "grid",
          flexShrink: 0,
          placeItems: "center",
        }),
        toneDisc[toneOf[props.kind]],
        props.class,
      )}
    >
      {glyphs[props.kind]()}
    </span>
  );
}

// Confirmed work is solid; in-flight parts are a pale tail (RELIABILITY:
// progress reflects confirmed work, in-flight activity shown separately).
export function Progress(props: {
  class?: string;
  confirmed: number;
  inFlight: number;
  kind: Kind;
  label: string;
  total: number;
  thick?: boolean;
}) {
  const pct = (value: number) => (props.total === 0 ? 0 : (value / props.total) * 100);
  return (
    <div
      aria-label={props.label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.floor(pct(props.confirmed))}
      class={cx(
        css({
          bg: "ink/8",
          borderRadius: "full",
          display: "flex",
          h: props.thick === true ? "2" : "1.5",
          overflow: "hidden",
        }),
        props.class,
      )}
      role="progressbar"
    >
      <div
        class={cx(
          toneBar[toneOf[props.kind]],
          css({
            _motionReduce: { transitionProperty: "[none]" },
            h: "full",
            transitionDuration: "slower",
            transitionProperty: "[width]",
            transitionTimingFunction: "smooth",
          }),
        )}
        style={{ width: `${pct(props.confirmed)}%` }}
      />
      <div class={css({ bg: "blue/25", h: "full" })} style={{ width: `${pct(props.inFlight)}%` }} />
    </div>
  );
}

// The Google photo when the account has one, its initial otherwise.
export const Avatar = (props: { image: string | null; name: string }) => (
  <span
    aria-hidden="true"
    class={css({
      bg: "ink",
      borderRadius: "full",
      boxSize: "8",
      color: "paper",
      display: "grid",
      fontSize: "13",
      fontWeight: "semibold",
      overflow: "hidden",
      placeItems: "center",
    })}
  >
    <Show when={props.image} fallback={props.name.trim().charAt(0).toUpperCase() || "?"}>
      {(image) => (
        // Google's photo host can answer 403 to a request with a referrer.
        <img
          alt=""
          class={css({ boxSize: "full", objectFit: "cover" })}
          referrerpolicy="no-referrer"
          src={image()}
        />
      )}
    </Show>
  </span>
);

const swap = css({
  "&[data-on=false]": { filter: "[blur(4px)]", opacity: 0, scale: "[.25]" },
  _motionReduce: { transitionProperty: "[opacity]" },
  gridArea: "[1/1]",
  transitionDuration: "normal",
  transitionProperty: "[opacity,scale,filter]",
  transitionTimingFunction: "[cubic-bezier(0.2,0,0,1)]",
});

/** Copies the delivery's public link and says so, in place and to screen readers. */
export function CopyLink(props: {
  class?: string;
  disabled?: boolean;
  link: string;
  variant: "fill" | "quiet";
}) {
  const [state, setState] = createSignal<"idle" | "copied" | "failed">("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearTimeout(timer);
  });
  const copy = async () => {
    const copied = await navigator.clipboard
      .writeText(`${location.origin}${props.link}`)
      .then(() => true)
      .catch(() => false);
    setState(copied ? "copied" : "failed");
    clearTimeout(timer);
    timer = setTimeout(() => {
      setState("idle");
    }, 1800);
  };
  return (
    <>
      <button
        class={cx(
          css({
            _active: { scale: "[.96]" },
            _disabled: { opacity: 0.45, pointerEvents: "none" },
            alignItems: "center",
            borderRadius: "xl",
            display: "inline-flex",
            flexShrink: 0,
            fontWeight: "semibold",
            gap: "2",
            minH: "10",
            px: "3.5",
            textStyle: "sm",
            transitionDuration: "fast",
            transitionProperty: "[scale,background-color,box-shadow]",
            transitionTimingFunction: "smooth",
          }),
          props.variant === "fill"
            ? css({ _hover: { bg: "[#23252b]" }, bg: "ink", color: "paper" })
            : css({ _hover: { bg: "white" }, bg: "panel", color: "ink", shadow: "paperRow" }),
          props.class,
        )}
        disabled={props.disabled}
        onClick={() => {
          void copy();
        }}
        type="button"
      >
        <span class={css({ display: "grid" })}>
          <PhCopyBold class={cx(icon, swap)} data-on={String(state() !== "copied")} />
          <PhCheckBold class={cx(icon, swap)} data-on={String(state() === "copied")} />
        </span>
        <span class={css({ fontVariantNumeric: "tabular-nums" })}>
          {state() === "copied" ? "Copied" : "Copy link"}
        </span>
      </button>
      <span class={css({ srOnly: true })} role="status">
        {state() === "copied" ? "Link copied" : ""}
      </span>
      <Show when={state() === "failed"}>
        <span class={css({ color: "rust", textStyle: "xs" })} role="alert">
          Couldn't copy. Open the delivery and copy the link by hand.
        </span>
      </Show>
    </>
  );
}

export const fieldLabel = css({ color: "mut", display: "grid", fontSize: "13", gap: "1" });
export const field = css({
  _focusVisible: {
    outlineColor: "blue",
    outlineOffset: "0.5",
    outlineStyle: "solid",
    outlineWidth: "2px",
  },
  bg: "white",
  borderRadius: "xl",
  color: "ink",
  fontSize: "[16px]",
  px: "3",
  py: "2",
  shadow: "[inset 0 0 0 1px var(--colors-line)]",
  w: "full",
});

/**
 * Sets, changes or removes the password on a delivery's link. The password is
 * typed in the open so the sender can read it back and send it by another
 * route; once saved, only the fact that one is set comes back.
 */
export function LinkPassword(props: {
  delivery: Delivery;
  setPassword: (deliveryId: DeliveryId, password: string | null) => Promise<string | undefined>;
}) {
  const [editing, setEditing] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const change = async (next: string | null) => {
    setProblem(undefined);
    const failure = await props.setPassword(props.delivery.id, next);
    if (failure === undefined) {
      setPassword("");
      setEditing(false);
    } else {
      setProblem(failure);
    }
  };
  return (
    <>
      <Show
        when={editing()}
        fallback={
          <div class={css({ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "2.5" })}>
            <Show
              when={props.delivery.hasPassword}
              fallback={
                <Button
                  onClick={() => {
                    setPassword("");
                    setEditing(true);
                  }}
                  size="xs"
                  variant="outline"
                >
                  Add a password
                </Button>
              }
            >
              <span
                class={css({
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "1.5",
                  textStyle: "sm",
                })}
              >
                <PhLockBold aria-hidden="true" class={css({ boxSize: "4" })} />
                Password set
              </span>
              <Button
                onClick={() => {
                  setPassword("");
                  setEditing(true);
                }}
                size="xs"
                variant="outline"
              >
                Change
              </Button>
              <Button
                onClick={() => {
                  void change(null);
                }}
                size="xs"
                variant="outline"
              >
                Remove
              </Button>
            </Show>
          </div>
        }
      >
        <form
          class={css({ display: "grid", gap: "3", maxW: "[460px]", w: "full" })}
          onSubmit={(event) => {
            event.preventDefault();
            void change(password());
          }}
        >
          <label class={fieldLabel}>
            Password for the recipient, 8 to 128 characters
            <input
              autocomplete="off"
              class={field}
              maxlength={128}
              minlength={8}
              name="password"
              onInput={(event) => {
                setPassword(event.currentTarget.value);
              }}
              required
              spellcheck="false"
              value={password()}
            />
          </label>
          <p class={css({ color: "mut", textStyle: "sm" })}>
            They type it before they see any file names. Send it to them yourself, not in the link
            message.
          </p>
          <div class={css({ display: "flex", gap: "2" })}>
            <Button disabled={password().length < 8} size="xs" type="submit">
              Save password
            </Button>
            <Button
              onClick={() => {
                setEditing(false);
              }}
              size="xs"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Show>
      <Show when={problem()}>
        {(message) => (
          <p class={css({ color: "rust", textStyle: "sm" })} role="alert">
            {message()}
          </p>
        )}
      </Show>
    </>
  );
}

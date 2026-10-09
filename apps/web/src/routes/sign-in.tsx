import { Meta, Title } from "@solidjs/meta";
import { PaidPlanId, RateLimited, plans } from "@tranzfer/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { createSignal, onSettled, Show } from "solid-js";
import { css, cx } from "styled-system/css";

import { authClient } from "../api/auth-client";
import { appError } from "../api/errors";
import { bytes } from "../dashboard/format";
import Brand from "../landing/Brand";
import videoEdit from "../landing/assets/video-edit.webp";
import "../landing/landing.css";

const GoogleG = (props: { class?: string }) => (
  <svg class={props.class} viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

// A pricing button sends signed-out visitors here with the plan to buy; the
// dashboard carries on to checkout once they are in.
const destination = () => {
  const plan = Schema.decodeUnknownOption(PaidPlanId)(
    new URLSearchParams(location.search).get("plan"),
  );
  return Option.isSome(plan) ? `/deliveries?plan=${plan.value}` : "/deliveries";
};

const scopes = "We use your name, email and photo from Google. Nothing else.";

// Over an auth limit, the API answers 429 with an encoded RateLimited.
const asRefusal = Schema.decodeUnknownOption(RateLimited);
const refusal = (error: Option.Option<RateLimited>, fallback: string) =>
  Option.match(error, {
    onNone: () => fallback,
    onSome: (limited) => appError(limited).message,
  });

// Better Auth redirects a failed Google callback here with its error code.
// For the new-accounts cap the description is the wait in seconds.
const callbackFailure = (params: URLSearchParams) => {
  const code = params.get("error");
  const retryAfterSeconds = Number(params.get("error_description"));
  if (code === "RateLimited" && Number.isInteger(retryAfterSeconds)) {
    return appError(new RateLimited({ limit: "newAccounts", retryAfterSeconds })).message;
  }
  return code === null ? undefined : "Google sign-in didn't finish. Try again.";
};

export default function SignIn() {
  const [pending, setPending] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();
  const [keyFailure, setKeyFailure] = createSignal<string>();
  const [key, setKey] = createSignal("");
  const [staging, setStaging] = createSignal(false);
  // Only production has a Google provider; everywhere else the staging key
  // endpoint is the way in. The signal flips after mount so SSR and the
  // first client render match.
  onSettled(() => {
    setStaging(location.hostname !== "tranzfer.app");
    setFailure(callbackFailure(new URLSearchParams(location.search)));
  });

  const signInWithGoogle = async () => {
    if (pending()) {
      return;
    }
    setPending(true);
    setFailure(undefined);
    const fallback = "Google sign-in didn't open. Try again.";
    try {
      const result = await authClient.signIn.social({
        callbackURL: destination(),
        provider: "google",
      });
      setFailure(result.error === null ? undefined : refusal(asRefusal(result.error), fallback));
    } catch {
      setFailure(fallback);
    } finally {
      setPending(false);
    }
  };

  const signInWithKey = async (secret: string) => {
    if (pending()) {
      return;
    }
    setPending(true);
    setKeyFailure(undefined);
    const fallback = "That key didn't work. Try again.";
    try {
      const response = await fetch("/api/auth/staging-login", {
        body: JSON.stringify({ key: secret }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (response.ok) {
        location.assign(destination());
        return;
      }
      setKeyFailure(refusal(asRefusal(await response.json().catch(() => null)), fallback));
    } catch {
      setKeyFailure(fallback);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      class={css({
        display: "grid",
        gridTemplateColumns: { lg: "[1.15fr 1fr]" },
        minH: "screen",
      })}
    >
      <Title>Sign in — Tranzfer</Title>
      <Meta name="description" content="Sign in to Tranzfer with your Google account." />
      <aside
        class={css({
          bg: "[rgb(239 233 221/0.6)]",
          borderColor: "line",
          borderRightWidth: "1px",
          display: { base: "none", lg: "block" },
          overflow: "hidden",
          pos: "relative",
        })}
      >
        <div
          class={css({
            alignItems: "center",
            display: "flex",
            h: "16",
            left: "10",
            pos: "absolute",
            top: "0",
          })}
        >
          <Brand />
        </div>
        <figure
          class={cx(
            "note",
            css({
              bg: "white",
              borderRadius: "md",
              left: "[16%]",
              p: "2.5",
              paddingBottom: "9",
              pos: "absolute",
              rotate: "[-3deg]",
              shadow: "[0 40px 70px -40px rgba(23,24,28,.6),0 0 0 1px rgba(0,0,0,.06)]",
              top: "[20%]",
              w: "[min(440px,62%)]",
            }),
          )}
        >
          <span class="tape" />
          <img
            class={css({
              aspectRatio: "landscape",
              borderRadius: "photo",
              filter: "[saturate(.9)]",
              objectFit: "cover",
              w: "full",
            })}
            src={videoEdit}
            alt=""
          />
          <figcaption
            class={css({
              bottom: "3",
              color: "mut",
              fontFamily: "mono",
              fontSize: "[10px]",
              left: "3.5",
              letterSpacing: "label",
              pos: "absolute",
              textTransform: "uppercase",
            })}
          >
            ep14 · edit bay · 286 gb
          </figcaption>
        </figure>
        <p
          class={css({
            color: "blue/70",
            fontFamily: "hand",
            fontWeight: "semibold",
            left: "[58%]",
            lineHeight: "tight",
            pos: "absolute",
            rotate: "[-6deg]",
            textStyle: "2xl",
            top: "[64%]",
            w: "[200px]",
          })}
        >
          your editor is waiting on this one.
        </p>
        <div
          class={css({
            bottom: "24",
            color: "mut",
            display: "grid",
            fontFamily: "mono",
            fontSize: "13",
            gap: "1",
            left: "12",
            pos: "absolute",
            right: "12",
          })}
        >
          <span
            class={css({
              borderBottomStyle: "dashed",
              borderBottomWidth: "1px",
              borderColor: "line",
              display: "flex",
              justifyContent: "space-between",
              py: "1.5",
            })}
          >
            <b class={css({ color: "ink", fontWeight: "medium" })}>EP14_A-Cam</b> 214 GB
          </span>
          <span
            class={css({
              borderBottomStyle: "dashed",
              borderBottomWidth: "1px",
              borderColor: "line",
              display: "flex",
              justifyContent: "space-between",
              py: "1.5",
            })}
          >
            <b class={css({ color: "ink", fontWeight: "medium" })}>EP14_B-Cam</b> 61 GB
          </span>
          <span class={css({ display: "flex", justifyContent: "space-between", py: "1.5" })}>
            <b class={css({ color: "ink", fontWeight: "medium" })}>EP14_Audio</b> 11 GB
          </span>
        </div>
      </aside>
      <main
        class={css({ display: "flex", flexDir: "column", px: { base: "8", sm: "16" }, py: "7" })}
      >
        <div class={css({ lg: { visibility: "hidden" } })}>
          <Brand />
        </div>
        <div class={css({ marginBlock: "auto", maxW: "narrow", py: "16" })}>
          <h1
            class={css({
              fontSize: "40",
              fontWeight: "semibold",
              letterSpacing: "title",
              lineHeight: "[1.02]",
              textWrap: "balance",
            })}
          >
            Sign in to send <i class={css({ color: "blue" })}>the big stuff.</i>
          </h1>
          <p class={css({ color: "mut", fontSize: "17", mt: "4" })}>
            One Google account. No password, no setup.
          </p>
          <p class={css({ color: "ink", fontSize: "[14px]", fontWeight: "medium", mt: "3" })}>
            {bytes(plans.free.activeBytes)} free. Links last up to {plans.free.maxRetentionDays}{" "}
            days. No card.
          </p>
          <button
            class={css({
              _active: { translate: "[0 1px]" },
              _disabled: { opacity: 0.6, pointerEvents: "none" },
              _focusVisible: {
                outlineColor: "blue",
                outlineOffset: "0.75",
                outlineStyle: "solid",
                outlineWidth: "2px",
              },
              _hover: {
                bg: "[#f7f8fa]",
                shadow: "[0 1px 3px rgba(60,64,67,.3)]",
              },
              alignItems: "center",
              bg: "white",
              borderRadius: "full",
              color: "[#1f1f1f]",
              display: "inline-flex",
              fontSize: "15",
              fontWeight: "medium",
              gap: "3",
              h: "12",
              justifyContent: "center",
              mt: "8",
              px: "6",
              shadow: "ringGoogle",
              transitionDuration: "normal",
              transitionProperty: "[background-color,box-shadow,translate]",
              transitionTimingFunction: "smooth",
              w: "full",
            })}
            onClick={() => {
              void signInWithGoogle();
            }}
            disabled={pending()}
            aria-busy={pending() ? "true" : "false"}
            type="button"
          >
            <GoogleG class={css({ boxSize: "5", flexShrink: 0 })} />
            {pending() ? "Opening Google…" : "Continue with Google"}
          </button>
          <Show when={failure()}>
            {(message) => (
              <p class={css({ color: "rust", mt: "3", textStyle: "sm" })} role="alert">
                {message()}
              </p>
            )}
          </Show>
          <p class={css({ color: "mut", mt: "6", textStyle: "sm" })}>
            {scopes} By continuing you agree to the{" "}
            <a class={css({ textDecoration: "underline" })} href="/terms">
              terms
            </a>{" "}
            and{" "}
            <a class={css({ textDecoration: "underline" })} href="/privacy">
              privacy policy
            </a>
            .
          </p>
          <Show when={staging()}>
            <form
              class={css({
                borderColor: "line",
                borderTopStyle: "dashed",
                borderTopWidth: "1px",
                mt: "8",
                pt: "6",
              })}
              onSubmit={(event) => {
                event.preventDefault();
                void signInWithKey(key());
              }}
            >
              <label class={css({ fontWeight: "medium", textStyle: "sm" })} for="staging-key">
                Staging key
              </label>
              <div class={css({ display: "flex", gap: "2", mt: "2" })}>
                <input
                  autocomplete="off"
                  class={css({
                    _focusVisible: {
                      outlineColor: "blue",
                      outlineOffset: "0.75",
                      outlineStyle: "solid",
                      outlineWidth: "2px",
                    },
                    bg: "white",
                    borderRadius: "full",
                    flex: "1",
                    fontSize: "15",
                    h: "12",
                    minW: "0",
                    px: "5",
                    shadow: "ringGoogle",
                  })}
                  id="staging-key"
                  name="key"
                  onInput={(event) => {
                    setKey(event.currentTarget.value);
                  }}
                  type="password"
                />
                <button
                  class={css({
                    _active: { translate: "[0 1px]" },
                    _disabled: { opacity: 0.6, pointerEvents: "none" },
                    _hover: { bg: "ink/90" },
                    alignItems: "center",
                    bg: "ink",
                    borderRadius: "full",
                    color: "paper",
                    display: "inline-flex",
                    flexShrink: 0,
                    fontSize: "15",
                    fontWeight: "medium",
                    h: "12",
                    justifyContent: "center",
                    px: "6",
                    transitionDuration: "normal",
                    transitionProperty: "[background-color,translate]",
                    transitionTimingFunction: "smooth",
                  })}
                  disabled={pending()}
                  type="submit"
                >
                  {pending() ? "Signing in…" : "Sign in"}
                </button>
              </div>
              <Show when={keyFailure()}>
                {(message) => (
                  <p class={css({ color: "rust", mt: "3", textStyle: "sm" })} role="alert">
                    {message()}
                  </p>
                )}
              </Show>
            </form>
          </Show>
        </div>
        <a class={css({ _hover: { color: "ink" }, color: "mut", textStyle: "sm" })} href="/">
          ← Back to tranzfer.app
        </a>
      </main>
    </div>
  );
}

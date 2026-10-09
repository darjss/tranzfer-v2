import { PlanId, plans } from "@tranzfer/contracts";
import type { PaidPlanId, PlanId as Plan } from "@tranzfer/contracts";
import { dynamic } from "@solidjs/web";
import * as Exit from "effect/Exit";
import { action, createOptimistic, createSignal, For, Show, useContext } from "solid-js";
import { css, cx } from "styled-system/css";
import { Hand, Ink } from "./notebook";
import { eyebrow, section, sideTitle } from "./styles";
import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { goToCheckout } from "../dashboard/billing";
import { bytes } from "../dashboard/format";
import { button } from "../ui/Button";
import { paidPlansOpen } from "../ui/support";

// Who each plan is for, from docs/PRODUCT.md.
const forWhom: Record<Plan, string> = {
  free: "Try it on something big.",
  pro: "For working editors.",
  starter: "For the odd big shoot.",
  studio: "For heavy weeks and studios.",
};

const card = css({
  borderRadius: "card",
  display: "flex",
  flexDir: "column",
  gap: "5",
  p: "8",
  pos: "relative",
  transitionDuration: "[350ms]",
  transitionProperty: "[translate,rotate,box-shadow]",
  transitionTimingFunction: "smooth",
});

const plain = css({
  "@media (hover: hover)": {
    _hover: {
      shadow: "[0 0 0 1px var(--colors-line),0 40px 60px -40px rgba(23,24,28,.5)]",
      translate: "[0 -6px]",
    },
  },
  bg: "panel",
  shadow: "ring",
});

// Pro is the plan most people should be on, so it gets the room's attention:
// dark, taller, tilted until you reach for it.
const pro = css({
  "@media (hover: hover)": { _hover: { rotate: "[0deg]", translate: "[0 -6px]" } },
  bg: "ink",
  color: "paper",
  pb: "11",
  pt: "10",
  rotate: { base: "[0deg]", lg: "[-1.5deg]" },
  shadow: "[0 50px 90px -40px rgba(23,24,28,.9)]",
  zIndex: 1,
});

const field = css({
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
  minW: "0",
  px: "4",
  py: "3",
  shadow: "[inset 0 0 0 1px var(--colors-line)]",
});

/**
 * Asks to hear once when a closed paid plan opens. A signed-in visitor is
 * added in one click with their account's address; anyone else is asked for one.
 */
export function NotifyMe(props: { plan: PaidPlanId; hot: boolean }) {
  const runtime = useContext(RuntimeContext);
  const [asking, setAsking] = createOptimistic(false);
  const [needsEmail, setNeedsEmail] = createSignal(false);
  const [joined, setJoined] = createSignal<string>();

  const join = action(async function* join(input: {
    readonly email?: string;
    readonly plan: PaidPlanId;
  }) {
    setAsking(true);
    const exit = await runtime.runPromiseExit(ApiClient.use((api) => api.JoinInterest(input)));
    yield;
    if (Exit.isSuccess(exit)) {
      setJoined(exit.value.email);
      return;
    }
    const problem = appError(exit.cause);
    // Signed out: ask for an address instead.
    if (problem.tag === "Unauthorized") {
      setNeedsEmail(true);
      return;
    }
    const { toaster } = await import("../ui/Toasts");
    toaster.error({ description: problem.message, title: "We couldn't add you" });
  });

  return (
    <Show
      when={joined()}
      fallback={
        <Show
          when={needsEmail()}
          fallback={
            <button
              class={button({ variant: props.hot ? "fill" : "outline" })}
              disabled={asking()}
              onClick={() => {
                void join({ plan: props.plan });
              }}
              type="button"
            >
              Tell me when it opens
            </button>
          }
        >
          <form
            class={css({ display: "grid", gap: "2" })}
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("email");
              if (input instanceof HTMLInputElement) {
                void join({ email: input.value.trim(), plan: props.plan });
              }
            }}
          >
            <input
              aria-label="Your email"
              autocomplete="email"
              class={field}
              maxlength={254}
              name="email"
              placeholder="you@studio.com"
              ref={(input) => {
                // The form replaces the button that had focus.
                requestAnimationFrame(() => {
                  input.focus();
                });
              }}
              required
              type="email"
            />
            <button
              class={button({ variant: props.hot ? "fill" : "outline" })}
              disabled={asking()}
              type="submit"
            >
              {asking() ? "Adding…" : "Notify me"}
            </button>
            <p class={css({ color: props.hot ? "[#c9c6bc]" : "mut", fontSize: "13" })}>
              We'll email you once, the day {plans[props.plan].name} opens.
            </p>
          </form>
        </Show>
      }
    >
      {(email) => (
        <p class={css({ color: props.hot ? "[#e8e5dc]" : "ink", fontSize: "15" })} role="status">
          You're on the list. We'll email {email()} once, the day {plans[props.plan].name} opens.
        </p>
      )}
    </Show>
  );
}

/** On /pricing this section is the page, so its title is the h1. */
export default function Pricing(props: { heading?: "h1" }) {
  const runtime = useContext(RuntimeContext);
  const Heading = dynamic(() => props.heading ?? "h2");
  const PlanHeading = dynamic(() => (props.heading === "h1" ? "h2" : "h3"));

  // The checkout call needs a session. A signed-out visitor signs in first and
  // the dashboard carries on to checkout for this plan.
  const choose = async (plan: PaidPlanId) => {
    const result = await goToCheckout(runtime, plan);
    if (result?.tag === "Unauthorized") {
      location.assign(`/sign-in?plan=${plan}`);
    } else if (result !== undefined) {
      const { toaster } = await import("../ui/Toasts");
      toaster.error({ description: result.message, title: "Checkout didn't open" });
    }
  };

  return (
    <section id="pricing" class={section}>
      <Hand tone="blue" style="left:38%;top:24%;--r:-6deg;--d:.9s">
        $29. one reshoot
        <br />
        costs more ↓
      </Hand>
      <div
        class={css({
          alignItems: "end",
          columnGap: "16",
          display: "grid",
          gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) minmax(0,1fr)" },
          mb: { base: "10", lg: "14" },
          rowGap: "4",
        })}
      >
        <div>
          <p class={eyebrow}>Pricing</p>
          <Heading class={cx("rv", sideTitle)}>
            Pay for the work. <i>Not per gigabyte.</i>
          </Heading>
        </div>
        <div class={css({ pos: "relative" })}>
          <Hand style="right:0;top:-70%;--r:4deg;--d:.5s">
            day 3. Marcus has
            <br />
            everything. <s>cancel</s>
          </Hand>
          <p class={cx("rv", css({ color: "mut", fontSize: "15", textWrap: "pretty" }))}>
            Every plan picks up after dropped Wi-Fi, reloads and crashes, sends whole folders and
            gives your editor one link, no account needed. Bigger plans hold more at once and keep
            links longer. Files count against your space until the link expires or you cancel it.
            Downloads don't free space.
          </p>
        </div>
      </div>

      <div
        class={css({
          alignItems: "end",
          display: "grid",
          gap: "5",
          gridTemplateColumns: {
            base: "1fr",
            lg: "repeat(4,minmax(0,1fr))",
            md: "repeat(2,minmax(0,1fr))",
          },
        })}
      >
        <For each={PlanId.literals}>
          {(id, i) => {
            const hot = id === "pro";
            return (
              <div class={cx("rv", card, hot ? pro : plain)} style={`--d:${i() * 70}ms`}>
                <Show when={hot}>
                  <span
                    class={css({
                      bg: "[rgba(236,222,170,.92)]",
                      color: "ink",
                      fontFamily: "hand",
                      fontSize: "[19px]",
                      fontWeight: "semibold",
                      left: "[50%]",
                      lineHeight: "none",
                      pos: "absolute",
                      px: "3.5",
                      py: "1.5",
                      rotate: "[3deg]",
                      shadow: "[0 2px 6px rgba(0,0,0,.18)]",
                      top: "-3.5",
                      translate: "[-50% 0]",
                      whiteSpace: "nowrap",
                    })}
                  >
                    for regular big sends
                  </span>
                </Show>
                <PlanHeading
                  class={css({
                    color: hot ? "[#a9a79e]" : "mut",
                    fontSize: "13",
                    fontWeight: "medium",
                  })}
                >
                  {plans[id].name}
                </PlanHeading>
                <div
                  class={css({
                    fontFamily: "mono",
                    fontSize: "[48px]",
                    fontWeight: "medium",
                    letterSpacing: "[-0.04em]",
                    lineHeight: "none",
                    pos: "relative",
                    w: "fit",
                  })}
                >
                  <Show when={hot}>
                    <Ink
                      tone="blue"
                      style="left:-18px;top:-14px;width:170px;height:76px"
                      viewBox="0 0 180 80"
                    >
                      <ellipse
                        cx="90"
                        cy="40"
                        rx="84"
                        ry="32"
                        style="--len:360;--d:.6s"
                        transform="rotate(-3 90 40)"
                      />
                    </Ink>
                  </Show>
                  ${plans[id].monthlyUsd}
                  <Show when={id !== "free"}>
                    <small class={css({ color: "mut", fontSize: "15", letterSpacing: "normal" })}>
                      /mo
                    </small>
                  </Show>
                </div>
                <p
                  class={css({
                    color: hot ? "[#e8e5dc]" : "ink",
                    fontSize: "15",
                    fontWeight: "medium",
                  })}
                >
                  {forWhom[id]}
                </p>
                <ul
                  class={css({
                    "& li::before": { content: "'—'", mr: "2.5", opacity: 0.5 },
                    color: hot ? "[#c9c6bc]" : "mut",
                    display: "grid",
                    flex: "1",
                    fontSize: "15",
                    gap: "2",
                    listStyle: "none",
                  })}
                >
                  <li>{bytes(plans[id].activeBytes)} across live links</li>
                  <li>Links live up to {plans[id].maxRetentionDays} days</li>
                </ul>
                <Show
                  when={id !== "free"}
                  fallback={
                    <a class={button({ variant: "outline" })} href="/sign-in">
                      Start free
                    </a>
                  }
                >
                  <Show
                    when={paidPlansOpen}
                    fallback={id === "free" ? undefined : <NotifyMe hot={hot} plan={id} />}
                  >
                    <button
                      class={button({ variant: hot ? "fill" : "outline" })}
                      onClick={() => {
                        // Free is the only plan without a checkout.
                        if (id !== "free") {
                          void choose(id);
                        }
                      }}
                      type="button"
                    >
                      Choose {plans[id].name}
                    </button>
                  </Show>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <p class={css({ color: "mut", mt: "6", textStyle: "sm" })}>
        {paidPlansOpen
          ? "Billed monthly through Polar. Cancel whenever; your plan runs to the end of the month you paid for."
          : "Paid plans open soon. Free has every feature today, with less space and shorter links."}
      </p>
    </section>
  );
}

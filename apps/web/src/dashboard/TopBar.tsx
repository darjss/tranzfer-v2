import { plans } from "@tranzfer/contracts";
import type { BillingSummary, PaidPlanId, Principal } from "@tranzfer/contracts";
import { Show } from "solid-js";
import { css, cx } from "styled-system/css";

import PhSignOutBold from "~icons/ph/sign-out-bold";
import PhTicketBold from "~icons/ph/ticket-bold";
import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";

import { authClient } from "../api/auth-client";
import Brand from "../landing/Brand";
import { Button, button } from "../ui/Button";
import { upgradeFrom } from "./billing";
import { paidPlansOpen } from "../ui/support";
import { bytes, untilDate } from "./format";
import { Avatar } from "./parts";

const signOut = async () => {
  await authClient.signOut();
  window.location.assign("/");
};

const menuItem = css({
  _hover: { bg: "ink/6" },
  alignItems: "center",
  borderRadius: "xl",
  display: "flex",
  fontWeight: "medium",
  gap: "2.5",
  px: "3",
  py: "2.5",
  textAlign: "left",
  textStyle: "sm",
  w: "full",
});

export function TopBar(props: {
  billing: BillingSummary;
  manage: () => void;
  principal: Principal;
  redeem: (code: string) => Promise<string | undefined>;
  redeeming: boolean;
  send: () => void;
  upgrade: (plan: PaidPlanId) => void;
}) {
  let codeInput: HTMLInputElement | undefined;
  // The redeem action toasts either way; on success the menu gets out of the way.
  const apply = async (form: HTMLFormElement) => {
    const code = codeInput?.value.trim() ?? "";
    if (code === "") {
      return;
    }
    if ((await props.redeem(code)) === undefined) {
      form.reset();
      form.closest("details")?.removeAttribute("open");
      document.querySelector<HTMLElement>("#account-menu")?.hidePopover();
    }
  };

  return (
    <nav
      aria-label="Account"
      class={css({
        alignItems: "center",
        borderBottomWidth: "1px",
        borderColor: "ink",
        display: "flex",
        gap: "3",
        h: "16",
        justifyContent: "space-between",
      })}
    >
      <Brand />
      <div class={css({ alignItems: "center", display: "flex", gap: { base: "2", sm: "4" } })}>
        <Button
          onClick={() => {
            props.send();
          }}
          size="sm"
        >
          <PhUploadSimpleBold />
          Send files
        </Button>
        <button
          aria-label={`Account: ${props.principal.name}`}
          class={css({
            _active: { scale: "[.96]" },
            _hover: { bg: "ink/6" },
            alignItems: "center",
            borderRadius: "full",
            display: "flex",
            gap: "2.5",
            p: "1",
            pr: { base: "1", md: "3" },
            transitionDuration: "fast",
            transitionProperty: "[background-color,scale]",
          })}
          popovertarget="account-menu"
          type="button"
        >
          <Avatar image={props.principal.image} name={props.principal.name} />
          <span
            class={css({
              display: { base: "none", md: "block" },
              fontWeight: "medium",
              maxW: "[16ch]",
              textStyle: "sm",
              truncate: true,
            })}
          >
            {props.principal.name}
          </span>
        </button>
        <div
          class={css({
            bg: "panel",
            borderRadius: "2xl",
            color: "ink",
            inset: "[auto]",
            m: "0",
            minW: "[240px]",
            p: "2",
            pos: "fixed",
            right: "[max(16px, calc((100vw - 1180px) / 2 + 28px))]",
            shadow: "paper",
            top: "[60px]",
          })}
          id="account-menu"
          popover="auto"
        >
          <div class={css({ px: "3", py: "2.5" })}>
            <p class={css({ fontWeight: "semibold", truncate: true })}>{props.principal.name}</p>
            <p class={css({ color: "mut", fontFamily: "mono", fontSize: "13", truncate: true })}>
              {props.principal.email}
            </p>
          </div>
          <div class={css({ borderColor: "line", borderTopWidth: "1px", px: "3", py: "2.5" })}>
            <p class={css({ fontWeight: "medium", textStyle: "sm" })}>
              {plans[props.billing.plan].name} · {bytes(props.billing.usedBytes)} of{" "}
              {bytes(props.billing.limitBytes)}
            </p>
            <Show when={props.billing.status === "past_due"}>
              <p class={css({ color: "rust", fontSize: "13" })}>
                Payment failed. Update it under Manage billing.
              </p>
            </Show>
            <Show
              when={props.billing.grantEndsAt}
              fallback={
                <Show when={props.billing.periodEnd}>
                  {(end) => (
                    <p class={css({ color: "mut", fontSize: "13" })}>
                      {props.billing.cancelsAtPeriodEnd ? "Ends" : "Renews"} {untilDate(end())}
                    </p>
                  )}
                </Show>
              }
            >
              {(end) => (
                <p class={css({ color: "mut", fontSize: "13" })}>
                  Free with a code until {untilDate(end())}
                </p>
              )}
            </Show>
          </div>
          <details>
            <summary
              class={cx(
                menuItem,
                css({
                  "&::-webkit-details-marker": { display: "none" },
                  cursor: "pointer",
                  listStyle: "none",
                }),
              )}
            >
              <PhTicketBold class={css({ boxSize: "4" })} />
              Have a code?
            </summary>
            <form
              class={css({ display: "flex", gap: "2", pb: "2", px: "2" })}
              onSubmit={(event) => {
                event.preventDefault();
                void apply(event.currentTarget);
              }}
            >
              <input
                aria-label="Access code"
                autocapitalize="characters"
                autocomplete="off"
                class={css({
                  _focusVisible: {
                    outlineColor: "blue",
                    outlineOffset: "0.5",
                    outlineStyle: "solid",
                    outlineWidth: "2px",
                  },
                  bg: "white",
                  borderRadius: "xl",
                  flex: "1",
                  fontFamily: "mono",
                  fontSize: "[16px]",
                  minW: "0",
                  px: "3",
                  shadow: "[inset 0 0 0 1px var(--colors-line)]",
                  textTransform: "uppercase",
                })}
                maxlength={64}
                name="code"
                placeholder="BETA-PRO"
                ref={(element) => {
                  codeInput = element;
                }}
                required
                spellcheck="false"
              />
              <button class={button({ size: "xs" })} disabled={props.redeeming} type="submit">
                {props.redeeming ? "Applying…" : "Apply"}
              </button>
            </form>
          </details>
          <Show when={paidPlansOpen && upgradeFrom[props.billing.plan]}>
            {(target) => (
              <button
                class={menuItem}
                onClick={() => {
                  props.upgrade(target());
                }}
                type="button"
              >
                Upgrade to {plans[target()].name} · ${plans[target()].monthlyUsd}/mo
              </button>
            )}
          </Show>
          <Show when={paidPlansOpen && props.billing.status !== "none"}>
            <button
              class={menuItem}
              onClick={() => {
                props.manage();
              }}
              type="button"
            >
              Manage billing
            </button>
          </Show>
          <button
            class={menuItem}
            onClick={() => {
              void signOut();
            }}
            type="button"
          >
            <PhSignOutBold class={css({ boxSize: "4" })} />
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

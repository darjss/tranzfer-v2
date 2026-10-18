import type { Delivery, DeliveryId } from "@tranzfer/contracts";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { css, cx } from "styled-system/css";

import PhXBold from "~icons/ph/x-bold";

import { Button } from "../ui/Button";
import { liveDelivery } from "./deliveries";
import { DeliveryFiles } from "./DeliveryFiles";
import { bytes, etaAt, fromNow, kindWords, sentAt, speedAt, untilDate } from "./format";
import {
  CopyLink,
  KindIcon,
  kindText,
  LinkPassword,
  Progress,
  sheetBlock,
  sheetHeading,
} from "./parts";
import { ResumeUpload } from "./ResumeUpload";
import "./dashboard.css";

function Details(props: {
  cancel: (deliveryId: DeliveryId) => Promise<string | undefined>;
  delivery: Delivery;
  online: boolean;
  setPassword: (deliveryId: DeliveryId, password: string | null) => Promise<string | undefined>;
}) {
  const live = liveDelivery(props);
  const [confirming, setConfirming] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  const shareable = () => props.delivery.status === "open" || props.delivery.status === "ready";

  // The action moves the delivery to cancelled at once; only a failure
  // comes back here, and the optimistic move reverts on its own.
  const cancel = async () => {
    setProblem(undefined);
    const failure = await props.cancel(props.delivery.id);
    if (failure === undefined) {
      setConfirming(false);
    } else {
      setProblem(failure);
    }
  };

  return (
    <>
      <section class={cx(sheetBlock, css({ borderTopWidth: "0", pt: "2" }))}>
        <div class={css({ alignItems: "center", display: "flex", gap: "3" })}>
          <KindIcon kind={live.kind()} />
          <p class={cx(css({ fontWeight: "semibold" }), kindText(live.kind()))}>
            {kindWords[live.kind()].label}
          </p>
        </div>
        <Show when={props.delivery.status !== "cancelled" && props.delivery.status !== "expired"}>
          <p
            class={css({
              fontFamily: "mono",
              fontSize: "26",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "snug",
              mt: "4",
            })}
          >
            {bytes(live.roll().confirmed)}
            <span class={css({ color: "mut", fontSize: "15" })}>
              {" "}
              of {bytes(live.total())} confirmed
            </span>
          </p>
          <Progress
            class={css({ mt: "3" })}
            confirmed={live.roll().confirmed}
            inFlight={live.roll().inFlight}
            kind={live.kind()}
            label="Confirmed upload progress"
            thick
            total={live.total()}
          />
        </Show>
        <Show when={live.kind() === "moving"}>
          <p
            class={css({
              color: "mut",
              fontFamily: "mono",
              fontSize: "13",
              fontVariantNumeric: "tabular-nums",
              mt: "2",
            })}
          >
            {speedAt(live.roll().speed)} ·{" "}
            {etaAt(live.total() - live.roll().confirmed, live.roll().speed)} left
            <Show when={live.roll().inFlight > 0}> · {bytes(live.roll().inFlight)} in flight</Show>
          </p>
        </Show>
        <p
          class={css({ _empty: { display: "none" }, color: "ink/80", mt: "3", textStyle: "sm" })}
          role="status"
        >
          <Show
            when={live.kind() === "ready" ? props.delivery.expiresAt : null}
            fallback={kindWords[live.kind()].detail}
          >
            {(expiresAt) => (
              <>
                Anyone with the link can download until {untilDate(expiresAt())},{" "}
                {fromNow(expiresAt())}.
              </>
            )}
          </Show>
        </p>
      </section>

      <ResumeUpload
        confirmed={live.roll().confirmed}
        delivery={props.delivery}
        needsFile={live.roll().needsFile}
      />

      <section class={sheetBlock}>
        <h3 class={sheetHeading}>Link</h3>
        <div
          class={css({
            alignItems: "center",
            bg: "white",
            borderRadius: "xl",
            display: "flex",
            gap: "2",
            mt: "2.5",
            pl: "3.5",
            pr: "1",
            py: "1",
            shadow: "paperRow",
          })}
        >
          <span
            class={cx(
              css({
                flex: "1",
                fontFamily: "mono",
                fontSize: "13",
                minW: "0",
                truncate: true,
                userSelect: "all",
              }),
              !shareable() && css({ color: "mut", textDecoration: "line-through" }),
            )}
          >
            {location.origin}
            {props.delivery.link}
          </span>
          <CopyLink disabled={!shareable()} link={props.delivery.link} variant="fill" />
        </div>
        <Show when={props.delivery.status === "open"}>
          <p class={css({ color: "mut", mt: "2", textStyle: "sm" })}>
            Share it now. It starts working once every file is finished.
          </p>
        </Show>
        <Show when={shareable()}>
          <div class={css({ display: "grid", gap: "2.5", mt: "4" })}>
            <LinkPassword delivery={props.delivery} setPassword={props.setPassword} />
          </div>
        </Show>
      </section>

      <DeliveryFiles transfers={props.delivery.transfers} />

      <Show when={shareable()}>
        <section class={cx(sheetBlock, css({ pb: "10" }))}>
          <Show
            when={confirming()}
            fallback={
              <Button
                onClick={() => {
                  setConfirming(true);
                }}
                size="sm"
                variant="outline"
              >
                Cancel delivery
              </Button>
            }
          >
            <p class={css({ fontWeight: "medium", textStyle: "sm" })}>
              Cancel it? Uploads stop, the link stops working and the files are deleted.
            </p>
            <div class={css({ display: "flex", flexWrap: "wrap", gap: "2.5", mt: "3" })}>
              <Button
                onClick={() => {
                  void cancel();
                }}
                size="sm"
                variant="danger"
              >
                Yes, cancel it
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false);
                }}
                size="sm"
                variant="outline"
              >
                Keep it
              </Button>
            </div>
          </Show>
          <Show when={problem()}>
            {(message) => (
              <p class={css({ color: "rust", mt: "3", textStyle: "sm" })} role="alert">
                {message()}
              </p>
            )}
          </Show>
        </section>
      </Show>
    </>
  );
}

/**
 * The selected delivery in a native modal dialog: a side sheet on wide
 * screens, a bottom sheet on phones. The dialog brings focus trapping,
 * Escape and an inert page; closing it clears ?d=.
 */
export function DeliverySheet(props: {
  cancel: (deliveryId: DeliveryId) => Promise<string | undefined>;
  close: () => void;
  delivery: Delivery | undefined;
  online: boolean;
  setPassword: (deliveryId: DeliveryId, password: string | null) => Promise<string | undefined>;
}) {
  let dialog: HTMLDialogElement | undefined;
  // Keep the last delivery on screen while the sheet slides away.
  const shown = createMemo((previous: Delivery | undefined) => props.delivery ?? previous);

  createEffect(
    () => props.delivery !== undefined,
    (open) => {
      if (dialog === undefined) {
        return;
      }
      if (open && !dialog.open) {
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    },
  );

  return (
    <dialog
      aria-labelledby="sheet-title"
      class={cx(
        "sheet",
        css({
          _backdrop: { bg: "ink/30" },
          bg: "paper",
          borderTopRadius: { base: "card", md: "[0]" },
          bottom: { base: "0", md: "[auto]" },
          color: "ink",
          h: { base: "auto", md: "dvh" },
          insetInline: { base: "0", md: "[auto 0]" },
          m: "0",
          maxH: { base: "[92dvh]", md: "dvh" },
          maxW: "[none]",
          overflowY: "auto",
          overscrollBehavior: "contain",
          p: "0",
          pos: "fixed",
          shadow: "paper",
          top: { base: "[auto]", md: "0" },
          w: { base: "full", md: "sheet" },
        }),
      )}
      onClick={(event) => {
        // A click on the dialog itself, not its content, is the backdrop.
        if (event.target === event.currentTarget) {
          props.close();
        }
      }}
      onClose={() => {
        props.close();
      }}
      ref={(element) => {
        dialog = element;
      }}
    >
      <Show when={shown()}>
        {(delivery) => (
          <div class={css({ minH: "full" })}>
            <header
              class={css({
                alignItems: "start",
                bg: "paper",
                display: "flex",
                gap: "4",
                justifyContent: "space-between",
                pb: "4",
                pos: "sticky",
                pt: "6",
                px: { base: "5", sm: "7" },
                top: "0",
                zIndex: 1,
              })}
            >
              <div class={css({ minW: "0" })}>
                <h2
                  class={css({
                    fontSize: "26",
                    fontWeight: "semibold",
                    letterSpacing: "snug",
                    lineHeight: "compact",
                    overflowWrap: "anywhere",
                  })}
                  id="sheet-title"
                >
                  {delivery().title}
                </h2>
                <p class={css({ color: "mut", fontFamily: "mono", fontSize: "13", mt: "1.5" })}>
                  <Show
                    when={delivery().uploader}
                    fallback={<>sent {sentAt(delivery().createdAt)}</>}
                  >
                    {(uploader) => (
                      <>
                        received {sentAt(delivery().createdAt)} from {uploader().name}
                        <Show when={uploader().email}>{(email) => <> ({email()})</>}</Show>
                      </>
                    )}
                  </Show>{" "}
                  · kept {delivery().retentionDays}{" "}
                  {delivery().retentionDays === 1 ? "day" : "days"} after upload
                </p>
              </div>
              <button
                aria-label="Close"
                class={css({
                  _active: { scale: "[.96]" },
                  _hover: { bg: "ink/6" },
                  borderRadius: "full",
                  boxSize: "10",
                  display: "grid",
                  flexShrink: 0,
                  placeItems: "center",
                  transitionDuration: "fast",
                  transitionProperty: "[background-color,scale]",
                })}
                onClick={() => {
                  props.close();
                }}
                type="button"
              >
                <PhXBold class={css({ boxSize: "4" })} />
              </button>
            </header>
            <Details
              cancel={props.cancel}
              delivery={delivery()}
              online={props.online}
              setPassword={props.setPassword}
            />
          </div>
        )}
      </Show>
    </dialog>
  );
}

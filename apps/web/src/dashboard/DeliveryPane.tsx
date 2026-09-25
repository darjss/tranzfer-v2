import type { Delivery } from "@tranzfer/contracts";
import { createMemo, createSignal, For, Show } from "solid-js";
import { css, cx } from "styled-system/css";

import PhCheckBold from "~icons/ph/check-bold";
import PhCopyBold from "~icons/ph/copy-bold";
import PhFileBold from "~icons/ph/file-bold";

import type { ApiClient } from "../api/client";
import { Button } from "../ui/Button";
import { cancelDelivery, retryTransfer } from "../uploads/uppy";
import { transfers } from "../uploads/store";
import type { ManagedRuntime } from "effect/ManagedRuntime";
import {
  bytes,
  etaAt,
  items,
  rollup,
  sentAt,
  speedAt,
  statusOf,
  toneText,
  totalSize,
  untilDate,
} from "./format";
import { Progress } from "./parts";

interface Props {
  readonly delivery: Delivery;
  readonly online: boolean;
  readonly runtime: ManagedRuntime<ApiClient, never>;
}

export function DeliveryPane(props: Props) {
  const [confirming, setConfirming] = createSignal(false);
  const [cancelling, setCancelling] = createSignal(false);
  const [problem, setProblem] = createSignal<string | undefined>();
  const [copied, setCopied] = createSignal(false);

  const roll = createMemo(() => rollup(props.delivery, (id) => transfers[id]));
  const status = createMemo(() => statusOf(props.delivery, roll(), props.online));
  const total = createMemo(() => totalSize(props.delivery));
  const link = () => `${location.origin}${props.delivery.link}`;
  const cancellable = () => props.delivery.status === "open" || props.delivery.status === "ready";

  const copy = async () => {
    await navigator.clipboard.writeText(link());
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1600);
  };

  const cancel = async () => {
    setCancelling(true);
    setProblem(undefined);
    try {
      await cancelDelivery(props.runtime, props.delivery.id);
      setConfirming(false);
    } catch {
      setProblem("The cancel didn't go through. Try again.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section class={css({ maxW: "[860px]", pb: "32", px: { base: "6", sm: "12" }, py: "10" })}>
      <p class={css({ color: "mut", fontFamily: "mono", fontSize: "xs" })}>
        Sent {sentAt(props.delivery.createdAt)} · keeps {props.delivery.retentionDays}{" "}
        {props.delivery.retentionDays === 1 ? "day" : "days"} after upload
      </p>
      <h1
        class={css({
          fontSize: "[40px]",
          fontWeight: "semibold",
          letterSpacing: "[-0.035em]",
          lineHeight: "tight",
          mt: "2",
        })}
      >
        {props.delivery.title}
      </h1>

      <section
        class={css({
          bg: "panel",
          borderRadius: "2xl",
          mt: "8",
          p: "6",
          shadow: "[0 0 0 1px var(--colors-line)]",
        })}
      >
        <p class={css({ fontFamily: "mono", fontSize: "[26px]", letterSpacing: "[-0.02em]" })}>
          {bytes(roll().confirmed)}
          <span class={css({ color: "mut", fontSize: "md" })}> of {bytes(total())} confirmed</span>
        </p>
        <Progress
          class={css({ mt: "4" })}
          flightPct={total() === 0 ? 0 : (roll().inFlight / total()) * 100}
          pct={total() === 0 ? 0 : (roll().confirmed / total()) * 100}
          thick
          tone={status().tone}
        />
        <p class={cx(css({ fontSize: "[15px]", mt: "3" }), toneText[status().tone])}>
          {status().long}
        </p>
        <Show when={roll().uploading && props.online && roll().speed > 0}>
          <p class={css({ color: "mut", fontFamily: "mono", fontSize: "xs", mt: "1" })}>
            {speedAt(roll().speed)} · {etaAt(total() - roll().confirmed, roll().speed)} left
          </p>
        </Show>
        <div
          class={css({
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: "3",
            mt: "5",
          })}
        >
          <Show
            when={confirming()}
            fallback={
              <Show when={cancellable()}>
                <Button
                  onClick={() => {
                    setConfirming(true);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Cancel delivery
                </Button>
              </Show>
            }
          >
            <span class={css({ color: "mut", fontSize: "sm" })}>
              Cancel it? Uploads stop and the link dies.
            </span>
            <Button
              disabled={cancelling()}
              onClick={() => {
                void cancel();
              }}
              size="sm"
              variant="outline"
            >
              {cancelling() ? "Cancelling…" : "Yes, cancel"}
            </Button>
            <button
              class={css({ color: "ink", fontSize: "sm", textDecoration: "underline" })}
              onClick={() => {
                setConfirming(false);
              }}
              type="button"
            >
              Keep it
            </button>
          </Show>
        </div>
        <Show when={problem() !== undefined}>
          <p class={css({ color: "rust", fontSize: "sm", mt: "3" })} role="alert">
            {problem()}
          </p>
        </Show>
      </section>

      <section class={css({ mt: "8" })}>
        <h2 class={css({ fontSize: "sm", fontWeight: "semibold" })}>Link</h2>
        <div
          class={css({
            alignItems: "center",
            bg: "panel",
            borderRadius: "xl",
            display: "flex",
            gap: "2",
            mt: "2",
            pl: "4",
            pr: "1.5",
            py: "1.5",
            shadow: "[0 0 0 1px var(--colors-line)]",
          })}
        >
          <span
            class={cx(
              css({ flex: "1", fontFamily: "mono", fontSize: "sm", truncate: true }),
              props.delivery.status === "expired" || props.delivery.status === "cancelled"
                ? css({ color: "mut", textDecoration: "line-through" })
                : undefined,
            )}
          >
            {link()}
          </span>
          <Button
            disabled={props.delivery.status !== "open" && props.delivery.status !== "ready"}
            onClick={() => {
              void copy();
            }}
            size="sm"
            variant="outline"
          >
            <PhCopyBold /> {copied() ? "Copied" : "Copy"}
          </Button>
        </div>
        <p class={css({ color: "mut", fontSize: "sm", mt: "2" })}>
          <Show
            when={props.delivery.status === "ready" && props.delivery.expiresAt !== null}
            fallback="Share it now. It starts working once every file is finished."
          >
            Anyone with the link can download until{" "}
            {props.delivery.expiresAt === null ? "it expires" : untilDate(props.delivery.expiresAt)}
            .
          </Show>
        </p>
      </section>

      <section class={css({ mt: "8" })}>
        <h2 class={css({ fontSize: "sm", fontWeight: "semibold" })}>
          Files{" "}
          <span
            class={css({ color: "mut", fontFamily: "mono", fontSize: "xs", fontWeight: "normal" })}
          >
            {items(props.delivery.transfers.length)}
          </span>
        </h2>
        <ul
          class={css({
            borderBottomWidth: "1px",
            borderColor: "line",
            borderTopWidth: "1px",
            divideColor: "line/70",
            divideY: "1px",
            mt: "2",
          })}
        >
          <For each={props.delivery.transfers}>
            {(transfer) => {
              const progress = createMemo(() => transfers[transfer.id]);
              return (
                <li
                  class={css({
                    alignItems: "center",
                    columnGap: "4",
                    display: "grid",
                    gridTemplateColumns: "[20px 1fr 140px 80px]",
                    py: "3",
                  })}
                >
                  <PhFileBold class={css({ boxSize: "4", color: "mut" })} />
                  <span class={css({ fontFamily: "mono", fontSize: "sm", truncate: true })}>
                    {transfer.path}
                  </span>
                  <Show
                    when={transfer.state !== "complete"}
                    fallback={
                      <PhCheckBold class={css({ boxSize: "4", color: "ok", justifySelf: "end" })} />
                    }
                  >
                    <Show
                      when={progress()?.phase === "failed"}
                      fallback={
                        <Show
                          when={progress() !== undefined}
                          fallback={
                            <span
                              class={css({ color: "rust", fontSize: "xs", textAlign: "right" })}
                            >
                              {transfer.state === "cancelled" ? "cancelled" : "interrupted"}
                            </span>
                          }
                        >
                          <div
                            class={css({
                              bg: "ink/8",
                              borderRadius: "full",
                              h: "1",
                              overflow: "hidden",
                            })}
                          >
                            <div
                              class={css({ bg: "blue", h: "full" })}
                              style={{
                                width: `${
                                  transfer.size === 0
                                    ? 0
                                    : ((progress()?.confirmed ?? 0) / transfer.size) * 100
                                }%`,
                              }}
                            />
                          </div>
                        </Show>
                      }
                    >
                      <button
                        class={css({
                          color: "ink",
                          fontSize: "xs",
                          justifySelf: "end",
                          textDecoration: "underline",
                        })}
                        onClick={() => {
                          retryTransfer(props.runtime, transfer.id);
                        }}
                        type="button"
                      >
                        Retry
                      </button>
                    </Show>
                  </Show>
                  <span
                    class={css({
                      color: "mut",
                      fontFamily: "mono",
                      fontSize: "sm",
                      textAlign: "right",
                    })}
                  >
                    {bytes(transfer.size)}
                  </span>
                </li>
              );
            }}
          </For>
        </ul>
      </section>
    </section>
  );
}

import type { Delivery } from "@tranzfer/contracts";
import { createMemo, createSignal, For, Show } from "solid-js";

import PhCheckBold from "~icons/ph/check-bold";
import PhCopyBold from "~icons/ph/copy-bold";
import PhFileBold from "~icons/ph/file-bold";

import type { ApiClient } from "../api/client";
import { Button } from "../ui/Button";
import { cancelDelivery, getUploads, retryTransfer } from "../uploads/uppy";
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
    <section class="max-w-[860px] px-6 py-10 pb-32 sm:px-12">
      <p class="font-mono text-xs text-mut">
        Sent {sentAt(props.delivery.createdAt)} · keeps {props.delivery.retentionDays}{" "}
        {props.delivery.retentionDays === 1 ? "day" : "days"} after upload
      </p>
      <h1 class="mt-2 text-[40px] leading-tight font-semibold tracking-[-0.035em]">
        {props.delivery.title}
      </h1>

      <section class="mt-8 rounded-2xl bg-panel p-6 ring-1 ring-line">
        <p class="font-mono text-[26px] tracking-[-0.02em]">
          {bytes(roll().confirmed)}
          <span class="text-base text-mut"> of {bytes(total())} confirmed</span>
        </p>
        <Progress
          class="mt-4"
          flightPct={total() === 0 ? 0 : (roll().inFlight / total()) * 100}
          pct={total() === 0 ? 0 : (roll().confirmed / total()) * 100}
          thick
          tone={status().tone}
        />
        <p class={["mt-3 text-[15px]", toneText[status().tone]]}>{status().long}</p>
        <Show when={roll().uploading && props.online && roll().speed > 0}>
          <p class="mt-1 font-mono text-xs text-mut">
            {speedAt(roll().speed)} · {etaAt(total() - roll().confirmed, roll().speed)} left
          </p>
        </Show>
        <div class="mt-5 flex flex-wrap items-center gap-3">
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
            <span class="text-sm text-mut">Cancel it? Uploads stop and the link dies.</span>
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
              class="text-sm text-ink underline"
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
          <p class="mt-3 text-sm text-rust" role="alert">
            {problem()}
          </p>
        </Show>
      </section>

      <section class="mt-8">
        <h2 class="text-sm font-semibold">Link</h2>
        <div class="mt-2 flex items-center gap-2 rounded-xl bg-panel py-1.5 pr-1.5 pl-4 ring-1 ring-line">
          <span
            class={[
              "flex-1 truncate font-mono text-sm",
              props.delivery.status === "expired" || props.delivery.status === "cancelled"
                ? "text-mut line-through"
                : "",
            ]}
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
        <p class="mt-2 text-sm text-mut">
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

      <section class="mt-8">
        <h2 class="text-sm font-semibold">
          Files{" "}
          <span class="font-mono text-xs font-normal text-mut">
            {items(props.delivery.transfers.length)}
          </span>
        </h2>
        <ul class="mt-2 divide-y divide-line/70 border-y border-line">
          <For each={props.delivery.transfers}>
            {(transfer) => {
              const progress = createMemo(() => transfers[transfer.id]);
              return (
                <li class="grid grid-cols-[20px_1fr_140px_80px] items-center gap-4 py-3">
                  <PhFileBold class="size-4 text-mut" />
                  <span class="truncate font-mono text-sm">{transfer.path}</span>
                  <Show
                    when={transfer.state !== "complete"}
                    fallback={<PhCheckBold class="size-4 justify-self-end text-ok" />}
                  >
                    <Show
                      when={progress()?.phase === "failed"}
                      fallback={
                        <Show
                          when={progress() !== undefined}
                          fallback={
                            <span class="text-right text-xs text-rust">
                              {transfer.state === "cancelled" ? "cancelled" : "interrupted"}
                            </span>
                          }
                        >
                          <div class="h-1 overflow-hidden rounded-full bg-ink/8">
                            <div
                              class="h-full bg-blue"
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
                        class="justify-self-end text-xs text-ink underline"
                        onClick={() => {
                          retryTransfer(getUploads(props.runtime).uppy, transfer.id);
                        }}
                        type="button"
                      >
                        Retry
                      </button>
                    </Show>
                  </Show>
                  <span class="text-right font-mono text-sm text-mut">{bytes(transfer.size)}</span>
                </li>
              );
            }}
          </For>
        </ul>
      </section>
    </section>
  );
}

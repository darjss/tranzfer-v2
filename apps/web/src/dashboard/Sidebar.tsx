import type { Delivery, Principal } from "@tranzfer/contracts";
import { createMemo, For, Show } from "solid-js";

import PhPlusBold from "~icons/ph/plus-bold";
import PhSignOutBold from "~icons/ph/sign-out-bold";

import { authClient } from "../api/auth-client";
import Brand from "../landing/Brand";
import { Button } from "../ui/Button";
import { transfers } from "../uploads/store";
import { bytes, rollup, statusOf, toneText, totalSize } from "./format";
import { Avatar, Progress } from "./parts";

interface Props {
  readonly deliveries: readonly Delivery[];
  readonly online: boolean;
  readonly principal: Principal;
  readonly selectedId: string | undefined;
  readonly select: (id?: string) => void;
}

const signOut = async () => {
  await authClient.signOut();
  window.location.assign("/");
};

export function Sidebar(props: Props) {
  const groups = createMemo(() => {
    const inProgress = props.deliveries.filter((d) => d.status === "open");
    const ready = props.deliveries.filter((d) => d.status === "ready");
    const ended = props.deliveries.filter(
      (d) => d.status === "expired" || d.status === "cancelled",
    );
    return [
      ["In progress", inProgress],
      ["Ready", ready],
      ["Ended", ended],
    ] as const;
  });

  return (
    <aside class="border-line max-lg:contents lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:bg-panel/85">
      <div class="flex h-16 items-center px-5 max-lg:bg-panel">
        <Brand />
      </div>
      <div class="border-b border-line px-4 pb-4 max-lg:bg-panel lg:border-0 lg:pb-0">
        <Button
          class="w-full"
          onClick={() => {
            props.select();
          }}
          size="sm"
        >
          <PhPlusBold /> New delivery
        </Button>
      </div>
      <nav class="mt-3 flex-1 overflow-y-auto px-2 pb-4 max-lg:order-2">
        <For each={groups()}>
          {([label, itemsInGroup]) => (
            <>
              <p class="flex gap-2 px-3 pt-5 pb-1.5 text-xs font-semibold text-mut">
                {label} <span class="font-mono font-normal">{itemsInGroup.length}</span>
              </p>
              <For each={itemsInGroup}>
                {(delivery) => {
                  const roll = createMemo(() => rollup(delivery, (id) => transfers[id]));
                  const status = createMemo(() => statusOf(delivery, roll(), props.online));
                  const total = createMemo(() => totalSize(delivery));
                  return (
                    <button
                      class={[
                        "grid w-full gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                        props.selectedId === delivery.id
                          ? "bg-paper ring-1 ring-line"
                          : "hover:bg-paper/60",
                      ]}
                      aria-current={props.selectedId === delivery.id ? "true" : undefined}
                      onClick={() => {
                        props.select(delivery.id);
                      }}
                      type="button"
                    >
                      <span class="flex items-baseline justify-between gap-3">
                        <b class="truncate text-[15px] font-semibold">{delivery.title}</b>
                        <small class="font-mono text-xs text-mut">{bytes(total())}</small>
                      </span>
                      <Show when={delivery.status === "open" && roll().local}>
                        <Progress
                          flightPct={total() === 0 ? 0 : (roll().inFlight / total()) * 100}
                          pct={total() === 0 ? 0 : (roll().confirmed / total()) * 100}
                          tone={status().tone}
                        />
                      </Show>
                      <small class={["text-xs", toneText[status().tone]]}>{status().short}</small>
                    </button>
                  );
                }}
              </For>
            </>
          )}
        </For>
      </nav>
      <footer class="flex items-center gap-3 border-t border-line px-4 py-3 text-sm max-lg:order-3">
        <Avatar name={props.principal.name} />
        <span class="truncate font-medium">{props.principal.name}</span>
        <button
          class="ml-auto text-mut transition-colors hover:text-ink"
          aria-label="Sign out"
          onClick={() => {
            void signOut();
          }}
          type="button"
        >
          <PhSignOutBold class="size-4" />
        </button>
      </footer>
    </aside>
  );
}

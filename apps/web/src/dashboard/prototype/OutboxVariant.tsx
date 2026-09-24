// PROTOTYPE, throwaway. Variant C: the page is the notebook. Deliveries are
// ledger lines sitting on the body's 32px rules, right of the margin line,
// grouped by day. Sending is a composer bar pinned to the bottom.
import { createSignal, For, Show } from "solid-js";
import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";

import Brand from "../../landing/Brand";
import { Button } from "../../ui/Button";
import type { Delivery } from "./data";
import { deliveries, gb, isActive, retentionChoices, status, toneText } from "./data";
import { Avatar, Progress } from "./parts";

const groups: [string, Delivery[]][] = [
  ["tonight", deliveries.filter((d) => d.sent.startsWith("Today"))],
  ["yesterday", deliveries.filter((d) => d.sent.startsWith("Yesterday"))],
  ["this week", deliveries.filter((d) => d.sent.startsWith("Mon"))],
  ["earlier", deliveries.filter((d) => d.sent.startsWith("Sep"))],
];

const row = "grid h-8 grid-cols-[minmax(0,1fr)_84px_220px_128px] items-center gap-6 leading-8";

function Line(props: { d: Delivery }) {
  const needsYou = () => props.d.stage.kind === "needs-file" || props.d.stage.kind === "offline";
  return (
    <>
      <div class={row}>
        <b class={["truncate font-semibold", props.d.stage.kind === "expired" ? "text-mut" : ""]}>
          {props.d.title}
        </b>
        <span class="text-right font-mono text-sm">{gb(props.d.size)}</span>
        <span class="flex items-center gap-3">
          <Show
            when={isActive(props.d)}
            fallback={
              <span class={["text-sm", toneText[status(props.d).tone]]}>
                {status(props.d).short}
              </span>
            }
          >
            <Progress d={props.d} class="w-20 shrink-0" />
            <span class={["truncate text-sm", toneText[status(props.d).tone]]}>
              {status(props.d).short}
            </span>
          </Show>
        </span>
        <span class="text-right text-sm">
          <Show when={props.d.stage.kind === "ready"}>
            <button class="font-semibold text-blue hover:underline" type="button">
              Copy link
            </button>
          </Show>
          <Show when={props.d.stage.kind === "needs-file"}>
            <button class="font-semibold text-rust hover:underline" type="button">
              Choose file
            </button>
          </Show>
        </span>
      </div>
      <Show when={needsYou()}>
        <p class={["h-8 truncate pl-5 text-sm leading-8", toneText[status(props.d).tone]]}>
          ↳ {status(props.d).long}
        </p>
      </Show>
    </>
  );
}

export function OutboxVariant() {
  const [days, setDays] = createSignal("3");
  return (
    <div class="min-h-screen pr-10 pb-40 pl-[96px]">
      <header class="flex h-16 max-w-[1040px] items-center justify-between">
        <Brand />
        <Avatar />
      </header>
      <main class="mt-8 max-w-[1040px]">
        <h1 class="h-16 text-[40px] leading-[64px] font-semibold tracking-[-0.03em]">Outbox</h1>
        <For each={groups}>
          {([label, items]) => (
            <section>
              <h2 class="h-8 font-hand text-[22px] leading-8 font-semibold text-blue/75">
                {label}
              </h2>
              <For each={items}>{(d) => <Line d={d} />}</For>
            </section>
          )}
        </For>
      </main>

      <div class="fixed inset-x-0 bottom-0 z-20 border-t border-ink bg-paper/95 backdrop-blur-sm">
        <div class="flex h-[72px] items-center justify-between gap-6 pr-10 pl-[96px]">
          <div class="flex items-center gap-4">
            <span class="grid size-10 place-items-center rounded-xl bg-ink text-white">
              <PhUploadSimpleBold class="size-5" />
            </span>
            <span class="text-[15px]">
              <b class="font-semibold">Drop files anywhere to send</b>
              <span class="text-mut">, or</span>
            </span>
            <Button size="sm">Choose files</Button>
          </div>
          <div class="flex items-center gap-5 text-sm">
            <label class="flex items-center gap-2 text-mut">
              Keep for
              <select
                class="rounded-lg bg-panel px-2 py-1.5 font-medium text-ink ring-1 ring-line"
                value={days()}
                onChange={(event) => {
                  setDays(event.currentTarget.value);
                }}
              >
                <For each={retentionChoices}>
                  {(choice) => <option value={String(choice)}>{choice} days</option>}
                </For>
              </select>
            </label>
            <span class="hidden font-mono text-xs text-mut xl:inline">
              No zips, disk images or apps
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

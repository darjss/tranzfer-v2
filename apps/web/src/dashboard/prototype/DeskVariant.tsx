// PROTOTYPE, throwaway. Variant A: one column. The drop zone is the page's
// primary affordance; in-progress deliveries sit under it, history below.
import { createSignal, For, Match, Switch } from "solid-js";
import PhCircleNotchBold from "~icons/ph/circle-notch-bold";
import PhCopyBold from "~icons/ph/copy-bold";
import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";

import Brand from "../../landing/Brand";
import { Button } from "../../ui/Button";
import type { Delivery } from "./data";
import { deliveries, gb, isActive, items, retentionChoices, status, toneText } from "./data";
import { Avatar, Progress } from "./parts";

function Action(props: { d: Delivery }) {
  return (
    <Switch>
      <Match when={props.d.stage.kind === "needs-file"}>
        <Button size="sm">Choose file</Button>
      </Match>
      <Match when={props.d.stage.kind === "finalizing"}>
        <PhCircleNotchBold class="size-5 animate-spin text-blue motion-reduce:animate-none" />
      </Match>
      <Match when={props.d.stage.kind === "ready"}>
        <Button size="sm" variant="outline">
          <PhCopyBold /> Copy link
        </Button>
      </Match>
      <Match when={isActive(props.d)}>
        <button class="text-sm font-medium text-mut hover:text-rust" type="button">
          Cancel
        </button>
      </Match>
    </Switch>
  );
}

export function DeskVariant() {
  const [days, setDays] = createSignal(3);
  const active = deliveries.filter(isActive);
  const history = deliveries.filter((d) => !isActive(d));
  return (
    <div class="mx-auto max-w-[920px] px-7 pb-36">
      <nav class="flex h-16 items-center justify-between border-b border-ink">
        <Brand />
        <div class="flex items-center gap-4 text-[15px] text-mut">
          <a class="hover:text-ink" href="/">
            Sign out
          </a>
          <Avatar />
        </div>
      </nav>

      <section class="mt-12">
        <h1 class="text-[34px] leading-tight font-semibold tracking-[-0.03em]">
          Send something big.
        </h1>
        <label class="group mt-6 block cursor-pointer rounded-[20px] border-[1.5px] border-dashed border-[#b9b2a2] bg-panel/70 px-8 py-12 text-center transition-[border-color,background-color] duration-200 hover:border-blue hover:bg-panel">
          <input class="sr-only" type="file" multiple />
          <span class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-ink text-white shadow-[0_16px_30px_-14px_rgba(0,0,0,.6)] transition-transform duration-200 ease-smooth group-hover:-translate-y-0.5">
            <PhUploadSimpleBold class="size-6" />
          </span>
          <b class="block text-lg font-semibold">Drop a folder or files</b>
          <span class="text-sm text-mut">
            or <u class="decoration-ink/30 underline-offset-2">choose from your computer</u>.
            Folders keep their structure.
          </span>
        </label>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div class="flex items-center gap-3">
            <span class="text-mut">Keep files for</span>
            <div class="flex rounded-full bg-panel p-0.5 ring-1 ring-line">
              <For each={retentionChoices}>
                {(choice) => (
                  <button
                    class={[
                      "rounded-full px-3 py-1 font-medium transition-colors duration-150",
                      days() === choice ? "bg-ink text-paper" : "text-mut hover:text-ink",
                    ]}
                    aria-pressed={days() === choice ? "true" : "false"}
                    onClick={() => {
                      setDays(choice);
                    }}
                    type="button"
                  >
                    {choice}d
                  </button>
                )}
              </For>
            </div>
          </div>
          <span class="font-mono text-xs text-mut">
            Zips, disk images and apps aren't accepted.
          </span>
        </div>
      </section>

      <section class="mt-14">
        <h2 class="flex items-baseline gap-2 text-sm font-semibold">
          In progress <span class="font-mono text-xs font-normal text-mut">{active.length}</span>
        </h2>
        <ul class="mt-3 grid gap-3">
          <For each={active}>
            {(d) => (
              <li class="rounded-2xl bg-panel p-5 ring-1 ring-line">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <b class="text-[17px] font-semibold">{d.title}</b>
                    <small class="block font-mono text-xs text-mut">
                      {gb(d.size)} · {items(d)} · keeps {d.retentionDays} days
                    </small>
                  </div>
                  <Action d={d} />
                </div>
                <Progress d={d} class="mt-4" />
                <p class={["mt-2.5 text-sm", toneText[status(d).tone]]}>{status(d).long}</p>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="mt-14">
        <h2 class="text-sm font-semibold">Sent</h2>
        <table class="mt-3 w-full text-left text-[15px]">
          <thead class="font-mono text-xs text-mut">
            <tr class="border-b border-line">
              <th class="py-2 font-normal">Delivery</th>
              <th class="py-2 text-right font-normal">Size</th>
              <th class="py-2 pl-8 font-normal">Sent</th>
              <th class="py-2 font-normal">Status</th>
              <th class="py-2" />
            </tr>
          </thead>
          <tbody>
            <For each={history}>
              {(d) => (
                <tr class="border-b border-line/70">
                  <td class="py-3 font-semibold">{d.title}</td>
                  <td class="py-3 text-right font-mono text-sm">{gb(d.size)}</td>
                  <td class="py-3 pl-8 font-mono text-sm text-mut">{d.sent}</td>
                  <td class={["py-3 text-sm", toneText[status(d).tone]]}>{status(d).short}</td>
                  <td class="py-3 text-right">
                    <Action d={d} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>
    </div>
  );
}

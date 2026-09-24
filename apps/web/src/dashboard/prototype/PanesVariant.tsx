// PROTOTYPE, throwaway. Variant B: mail-style panes. Every delivery lives in
// a grouped sidebar; the selected one fills the right with its link, its
// confirmed progress and a per-file breakdown.
import { createSignal, For, Show } from "solid-js";
import PhCheckBold from "~icons/ph/check-bold";
import PhCopyBold from "~icons/ph/copy-bold";
import PhFileBold from "~icons/ph/file-bold";
import PhFolderSimpleBold from "~icons/ph/folder-simple-bold";
import PhPlusBold from "~icons/ph/plus-bold";
import PhSignOutBold from "~icons/ph/sign-out-bold";

import Brand from "../../landing/Brand";
import { Button } from "../../ui/Button";
import { confirmedOf, deliveries, gb, isActive, status, toneText } from "./data";
import { Avatar, Progress } from "./parts";

const groups = [
  ["In progress", deliveries.filter(isActive)],
  ["Ready", deliveries.filter((d) => d.stage.kind === "ready")],
  ["Expired", deliveries.filter((d) => d.stage.kind === "expired")],
] as const;

export function PanesVariant() {
  const [selected, setSelected] = createSignal("ep14");
  const current = () => deliveries.find((d) => d.id === selected()) ?? deliveries[0];
  const link = () => {
    const { stage } = current();
    return stage.kind === "ready" ? stage.link : `tranzfer.app/d/${current().id}…`;
  };
  return (
    <div class="grid min-h-screen grid-cols-[320px_1fr]">
      <aside class="sticky top-0 flex h-screen flex-col border-r border-line bg-panel/85">
        <div class="flex h-16 items-center px-5">
          <Brand />
        </div>
        <div class="px-4">
          <Button class="w-full" size="sm">
            <PhPlusBold /> New delivery
          </Button>
        </div>
        <nav class="mt-3 flex-1 overflow-y-auto px-2 pb-4">
          <For each={groups}>
            {([label, items]) => (
              <>
                <p class="flex gap-2 px-3 pt-5 pb-1.5 text-xs font-semibold text-mut">
                  {label} <span class="font-mono font-normal">{items.length}</span>
                </p>
                <For each={items}>
                  {(d) => (
                    <button
                      class={[
                        "grid w-full gap-1.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
                        selected() === d.id ? "bg-paper ring-1 ring-line" : "hover:bg-paper/60",
                      ]}
                      aria-current={selected() === d.id ? "true" : undefined}
                      onClick={() => {
                        setSelected(d.id);
                      }}
                      type="button"
                    >
                      <span class="flex items-baseline justify-between gap-3">
                        <b class="truncate text-[15px] font-semibold">{d.title}</b>
                        <small class="font-mono text-xs text-mut">{gb(d.size)}</small>
                      </span>
                      <Show when={isActive(d)}>
                        <Progress d={d} />
                      </Show>
                      <small class={["text-xs", toneText[status(d).tone]]}>{status(d).short}</small>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </nav>
        <footer class="flex items-center gap-3 border-t border-line px-4 py-3 text-sm">
          <Avatar />
          <span class="font-medium">Darjs</span>
          <a class="ml-auto text-mut hover:text-ink" href="/" aria-label="Sign out">
            <PhSignOutBold class="size-4" />
          </a>
        </footer>
      </aside>

      <main class="max-w-[860px] px-12 py-10 pb-32">
        <p class="font-mono text-xs text-mut">
          Sent {current().sent} · keeps {current().retentionDays} days after upload
        </p>
        <h1 class="mt-2 text-[40px] leading-tight font-semibold tracking-[-0.035em]">
          {current().title}
        </h1>

        <section class="mt-8 rounded-2xl bg-panel p-6 ring-1 ring-line">
          <p class="font-mono text-[26px] tracking-[-0.02em]">
            {gb(confirmedOf(current()))}
            <span class="text-base text-mut"> of {gb(current().size)} confirmed</span>
          </p>
          <Progress d={current()} thick class="mt-4" />
          <p class={["mt-3 text-[15px]", toneText[status(current()).tone]]}>
            {(() => {
              const { stage } = current();
              return stage.kind === "uploading"
                ? `${stage.speed} · ${stage.eta} left`
                : status(current()).long;
            })()}
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <Show when={current().stage.kind === "needs-file"}>
              <Button size="sm">Choose the original file</Button>
            </Show>
            <Show when={isActive(current())}>
              <Button size="sm" variant="outline">
                Cancel delivery
              </Button>
            </Show>
          </div>
        </section>

        <section class="mt-8">
          <h2 class="text-sm font-semibold">Link</h2>
          <div class="mt-2 flex items-center gap-2 rounded-xl bg-panel py-1.5 pr-1.5 pl-4 ring-1 ring-line">
            <span
              class={[
                "flex-1 truncate font-mono text-sm",
                current().stage.kind === "expired" ? "text-mut line-through" : "",
              ]}
            >
              {link()}
            </span>
            <Button size="sm" variant="outline" disabled={current().stage.kind === "expired"}>
              <PhCopyBold /> Copy
            </Button>
          </div>
          <p class="mt-2 text-sm text-mut">
            <Show
              when={current().stage.kind === "ready"}
              fallback="Share it now. It starts working once every file is finished."
            >
              Anyone with the link can download until it expires.
            </Show>
          </p>
        </section>

        <section class="mt-8">
          <h2 class="text-sm font-semibold">
            Files{" "}
            <span class="font-mono text-xs font-normal text-mut">{current().files.length}</span>
          </h2>
          <ul class="mt-2 divide-y divide-line/70 border-y border-line">
            <For each={current().files}>
              {(f) => (
                <li class="grid grid-cols-[20px_1fr_120px_72px] items-center gap-4 py-3">
                  <Show
                    when={f.path.endsWith("/")}
                    fallback={<PhFileBold class="size-4 text-mut" />}
                  >
                    <PhFolderSimpleBold class="size-4 text-mut" />
                  </Show>
                  <span class="truncate font-mono text-sm">{f.path}</span>
                  <Show
                    when={f.state !== "complete"}
                    fallback={<PhCheckBold class="size-4 justify-self-end text-ok" />}
                  >
                    <div class="h-1 overflow-hidden rounded-full bg-ink/8">
                      <div
                        class={["h-full", f.state === "needs-file" ? "bg-rust" : "bg-blue"]}
                        style={{ width: `${(f.confirmed / f.size) * 100}%` }}
                      />
                    </div>
                  </Show>
                  <span class="text-right font-mono text-sm text-mut">{gb(f.size)}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </main>
    </div>
  );
}

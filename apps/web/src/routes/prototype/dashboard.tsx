// PROTOTYPE — throwaway. Three variants of a signed-in dashboard, switchable
// via ?variant=A|B|C on this route. Not functional; static sample data.
// Question: what should the dashboard look like? Bias: WeTransfer-simple —
// one primary action, few elements, lots of air.
import { For, Show, createMemo, onSettled } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { Dynamic } from "@solidjs/web";

type Transfer = {
  name: string;
  to: string;
  size: string;
  state: "sending" | "delivered" | "expiring" | "paused";
  pct: number;
  when: string;
};

const transfers: Transfer[] = [
  {
    name: "Wedding_Day2",
    to: "Marcus · Berlin",
    size: "130 GB",
    state: "sending",
    pct: 62,
    when: "now",
  },
  {
    name: "Travel_EP03",
    to: "Sora · Seoul",
    size: "402 GB",
    state: "paused",
    pct: 88,
    when: "laptop slept 2m ago",
  },
  {
    name: "Studio_Session",
    to: "Ana · New York",
    size: "286 GB",
    state: "delivered",
    pct: 100,
    when: "today, 09:14",
  },
  {
    name: "River_Below",
    to: "Bat · Ulaanbaatar",
    size: "96 GB",
    state: "expiring",
    pct: 100,
    when: "expires in 2 days",
  },
  {
    name: "Brand_Film_v7",
    to: "Client · Lisbon",
    size: "41 GB",
    state: "delivered",
    pct: 100,
    when: "Mon",
  },
];

const stateLabel: Record<Transfer["state"], string> = {
  sending: "Sending",
  paused: "Paused · will resume",
  delivered: "Delivered",
  expiring: "Expiring soon",
};

const dot: Record<Transfer["state"], string> = {
  sending: "bg-blue-600",
  paused: "bg-amber-500",
  delivered: "bg-emerald-600",
  expiring: "bg-neutral-400",
};

// A — one column, one card. The WeTransfer read: the page *is* the send box;
// history is a quiet list underneath.
function VariantA() {
  return (
    <main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-12 px-6 py-16">
      <header class="flex items-center justify-between text-sm text-neutral-500">
        <span class="font-semibold text-neutral-900">tranzfer</span>
        <span>1.2 TB of 2 TB free</span>
      </header>

      <section class="rounded-3xl border border-neutral-200 bg-white p-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,.25)]">
        <div class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 py-14 text-center">
          <div class="grid size-14 place-items-center rounded-full bg-neutral-900 text-white text-2xl">
            +
          </div>
          <p class="text-lg font-semibold text-neutral-900">Drop a card, a folder, anything</p>
          <p class="text-sm text-neutral-500">Up to 2 TB. If Wi-Fi drops, it resumes.</p>
        </div>
        <div class="mt-6 grid gap-3">
          <input
            class="h-12 rounded-xl border border-neutral-200 px-4 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900"
            placeholder="Send to (email)"
          />
          <input
            class="h-12 rounded-xl border border-neutral-200 px-4 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-900"
            placeholder="Title"
          />
          <button class="h-12 rounded-xl bg-neutral-900 text-sm font-semibold text-white">
            Transfer
          </button>
        </div>
      </section>

      <section>
        <h2 class="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-400">Recent</h2>
        <ul class="divide-y divide-neutral-200">
          <For each={transfers}>
            {(t) => (
              <li class="flex items-center gap-4 py-4">
                <span class={["size-2 shrink-0 rounded-full", dot[t.state]]} />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-neutral-900">{t.name}</p>
                  <p class="truncate text-sm text-neutral-500">
                    {t.size} → {t.to} · {t.when}
                  </p>
                </div>
                <Show
                  when={t.pct < 100}
                  fallback={<span class="text-sm text-neutral-400">{stateLabel[t.state]}</span>}
                >
                  <span class="font-mono text-sm tabular-nums text-neutral-900">{t.pct}%</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>
    </main>
  );
}

// B — workbench. Narrow rail, dense list, detail pane. For the editor who
// runs five transfers a day and wants to see them all at once.
function VariantB() {
  const selected = transfers[1];
  return (
    <main class="grid min-h-dvh grid-cols-[220px_1fr_360px] bg-neutral-50 text-neutral-900 max-lg:grid-cols-[220px_1fr] max-md:grid-cols-1">
      <aside class="flex flex-col gap-8 border-r border-neutral-200 bg-white p-6 max-md:hidden">
        <span class="font-semibold">tranzfer</span>
        <button class="h-11 rounded-lg bg-blue-600 text-sm font-semibold text-white">
          + New transfer
        </button>
        <nav class="grid gap-1 text-sm">
          <a class="rounded-md bg-neutral-100 px-3 py-2 font-medium" href="#">
            Transfers
          </a>
          <a class="rounded-md px-3 py-2 text-neutral-500 hover:bg-neutral-100" href="#">
            Received
          </a>
          <a class="rounded-md px-3 py-2 text-neutral-500 hover:bg-neutral-100" href="#">
            Team
          </a>
          <a class="rounded-md px-3 py-2 text-neutral-500 hover:bg-neutral-100" href="#">
            Settings
          </a>
        </nav>
        <div class="mt-auto text-xs text-neutral-500">
          <div class="mb-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div class="h-full w-[60%] bg-neutral-900" />
          </div>
          1.2 TB of 2 TB · Studio plan
        </div>
      </aside>

      <section class="p-8">
        <div class="mb-6 flex items-end justify-between">
          <h1 class="text-2xl font-semibold tracking-tight">Transfers</h1>
          <input
            class="h-9 w-64 rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none"
            placeholder="Search"
          />
        </div>
        <table class="w-full border-separate border-spacing-0 text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-neutral-400">
            <tr>
              <th class="pb-2 font-medium">Name</th>
              <th class="pb-2 font-medium">To</th>
              <th class="pb-2 font-medium">Size</th>
              <th class="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <For each={transfers}>
              {(t) => (
                <tr
                  class={[
                    "cursor-default",
                    t === selected ? "bg-white shadow-sm" : "hover:bg-white",
                  ]}
                >
                  <td class="rounded-l-lg px-3 py-3 font-medium">{t.name}</td>
                  <td class="px-3 py-3 text-neutral-500">{t.to}</td>
                  <td class="px-3 py-3 font-mono tabular-nums">{t.size}</td>
                  <td class="rounded-r-lg px-3 py-3">
                    <div class="flex items-center gap-3">
                      <div class="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-200">
                        <div class={["h-full", dot[t.state]]} style={{ width: `${t.pct}%` }} />
                      </div>
                      <span class="text-neutral-500">{stateLabel[t.state]}</span>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>

      <aside class="border-l border-neutral-200 bg-white p-8 max-lg:hidden">
        <p class="text-xs uppercase tracking-wider text-neutral-400">Paused</p>
        <h2 class="mt-1 text-xl font-semibold">{selected.name}</h2>
        <p class="text-sm text-neutral-500">
          {selected.size} → {selected.to}
        </p>
        <div class="my-6 h-2 overflow-hidden rounded-full bg-neutral-200">
          <div class="h-full bg-amber-500" style={{ width: `${selected.pct}%` }} />
        </div>
        <dl class="grid grid-cols-2 gap-y-3 text-sm">
          <dt class="text-neutral-500">Sent</dt>
          <dd class="font-mono tabular-nums">354 GB</dd>
          <dt class="text-neutral-500">Left</dt>
          <dd class="font-mono tabular-nums">48 GB</dd>
          <dt class="text-neutral-500">Pieces</dt>
          <dd class="font-mono tabular-nums">1,608 / 1,830</dd>
          <dt class="text-neutral-500">Last seen</dt>
          <dd>laptop slept 2m ago</dd>
        </dl>
        <p class="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Open the laptop and it picks up at piece 1,609. Nothing to redo.
        </p>
        <button class="mt-6 h-10 w-full rounded-lg border border-neutral-300 text-sm font-medium">
          Copy link
        </button>
      </aside>
    </main>
  );
}

// C — status-first. The whole page is a live board of what's in flight;
// the send action is a corner button, not the hero. For people who mostly
// come back to check "did it land?".
function VariantC() {
  const live = transfers.filter((t) => t.pct < 100);
  const done = transfers.filter((t) => t.pct === 100);
  return (
    <main class="min-h-dvh bg-neutral-900 px-6 py-10 text-neutral-100 md:px-16">
      <header class="flex items-center justify-between">
        <span class="font-semibold">tranzfer</span>
        <button class="h-10 rounded-full bg-white px-5 text-sm font-semibold text-neutral-900">
          New transfer
        </button>
      </header>

      <section class="mt-20">
        <p class="text-sm text-neutral-400">In flight</p>
        <div class="mt-4 grid gap-px overflow-hidden rounded-2xl bg-neutral-800 md:grid-cols-2">
          <For each={live}>
            {(t) => (
              <div class="bg-neutral-900 p-8">
                <div class="flex items-baseline justify-between">
                  <h2 class="text-2xl font-semibold tracking-tight">{t.name}</h2>
                  <span class="font-mono text-4xl tabular-nums">{t.pct}%</span>
                </div>
                <p class="mt-1 text-sm text-neutral-400">
                  {t.size} → {t.to}
                </p>
                <div class="mt-8 h-1 overflow-hidden rounded-full bg-neutral-700">
                  <div
                    class={["h-full", t.state === "paused" ? "bg-amber-400" : "bg-white"]}
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
                <p class="mt-3 text-sm text-neutral-400">
                  {stateLabel[t.state]} · {t.when}
                </p>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="mt-16">
        <p class="text-sm text-neutral-400">Landed</p>
        <ul class="mt-4 grid gap-y-3 text-sm md:grid-cols-[1fr_auto_auto] md:gap-x-10">
          <For each={done}>
            {(t) => (
              <li class="contents">
                <span class="font-medium">{t.name}</span>
                <span class="text-neutral-400">{t.to}</span>
                <span class="text-neutral-400">{t.when}</span>
              </li>
            )}
          </For>
        </ul>
      </section>

      <footer class="mt-24 text-xs text-neutral-500">1.2 TB of 2 TB · Studio plan</footer>
    </main>
  );
}

const variants = {
  A: ["One card", VariantA],
  B: ["Workbench", VariantB],
  C: ["Status board", VariantC],
} as const;
type Key = keyof typeof variants;
const keys = Object.keys(variants) as Key[];

function Switcher(props: { current: Key; go: (k: Key) => void }) {
  const step = (d: number) =>
    props.go(keys[(keys.indexOf(props.current) + d + keys.length) % keys.length]);
  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return (
    <div class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-fuchsia-600 px-2 py-1.5 font-mono text-xs text-white shadow-xl">
      <button class="size-7 rounded-full hover:bg-white/20" onClick={() => step(-1)}>
        ←
      </button>
      <span>
        PROTOTYPE {props.current} — {variants[props.current][0]}
      </span>
      <button class="size-7 rounded-full hover:bg-white/20" onClick={() => step(1)}>
        →
      </button>
    </div>
  );
}

export default function DashboardPrototype() {
  const [params, setParams] = useSearchParams<{ variant: string }>();
  const current = createMemo(
    () => (params.variant && params.variant in variants ? (params.variant as Key) : "A"),
    { name: "variant" },
  );
  return (
    <>
      <Dynamic component={variants[current()][1]} />
      <Show when={import.meta.env.DEV}>
        <Switcher current={current()} go={(k) => setParams({ variant: k }, { replace: true })} />
      </Show>
    </>
  );
}

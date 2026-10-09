import type { Delivery, DeliveryId } from "@tranzfer/contracts";
import { createMemo, createSignal, For, Match, Show, Switch, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { css, cx } from "styled-system/css";

import PhCaretDownBold from "~icons/ph/caret-down-bold";

import { RuntimeContext } from "../api/solid-effect";
import { Button } from "../ui/Button";
import { transfers } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import {
  bytes,
  downloadWords,
  etaAt,
  files,
  fromNow,
  groupOf,
  kindOf,
  kindWords,
  rollup,
  speedAt,
} from "./format";
import type { Group } from "./format";
import { liveDelivery } from "./deliveries";
import { CopyLink, KindIcon, kindText, Progress } from "./parts";

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  weekday: "short",
});

const sectionTitle = css({
  alignItems: "baseline",
  display: "flex",
  fontSize: "17",
  fontWeight: "semibold",
  gap: "2",
  letterSpacing: "snug",
});

const count = css({ color: "mut", fontFamily: "mono", fontSize: "13", fontWeight: "normal" });

const slot = css({ alignItems: "center", display: "flex", gap: "2", pos: "relative", zIndex: 1 });

/**
 * This browser has no record of the upload, so the only way forward is to
 * cancel it and send the files again. One action does both after an in-place
 * confirm: the picker opens inside the click, which browsers require.
 */
function StartOver(props: {
  cancel: (deliveryId: DeliveryId) => Promise<string | undefined>;
  deliveryId: DeliveryId;
  sendAgain: () => void;
}) {
  const [confirming, setConfirming] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  // The action moves the delivery to cancelled at once; only a failure
  // comes back here, and the optimistic move reverts on its own.
  const startOver = async () => {
    setProblem(undefined);
    props.sendAgain();
    const failure = await props.cancel(props.deliveryId);
    if (failure === undefined) {
      setConfirming(false);
    } else {
      setProblem(failure);
    }
  };
  return (
    <>
      <div class={slot}>
        <Button
          disabled={confirming()}
          onClick={() => {
            setConfirming(true);
          }}
          size="sm"
        >
          Start over
        </Button>
      </div>
      <Show when={confirming() || problem() !== undefined}>
        <div
          class={css({
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: "2",
            gridColumn: "[1 / -1]",
            mt: "3",
            pos: "relative",
            zIndex: 1,
          })}
        >
          <Show when={confirming()}>
            <span class={css({ fontWeight: "medium", textStyle: "sm", w: "full" })}>
              Cancel this delivery and pick the files again? Its link stops working.
            </span>
            <Button
              onClick={() => {
                void startOver();
              }}
              size="xs"
              variant="danger"
            >
              Yes, start over
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
              }}
              size="xs"
              variant="outline"
            >
              Keep it
            </Button>
          </Show>
          <Show when={problem()}>
            {(message) => (
              <p class={css({ color: "rust", textStyle: "sm", w: "full" })} role="alert">
                {message()}
              </p>
            )}
          </Show>
        </div>
      </Show>
    </>
  );
}

interface RowActions {
  readonly cancel: (deliveryId: DeliveryId) => Promise<string | undefined>;
  readonly select: (id: string) => void;
  readonly sendAgain: () => void;
}

const sameMembers = (a: readonly Delivery[], b: readonly Delivery[]) =>
  a.length === b.length && a.every((delivery, index) => delivery === b[index]);

// Solid compares against undefined when the memo's first run threw (the list
// failed to load) and a retry computes it. That must read as "changed", not
// crash the retry.
const sameGroups = (a: Record<Group, Delivery[]> | undefined, b: Record<Group, Delivery[]>) =>
  a !== undefined &&
  sameMembers(a.ended, b.ended) &&
  sameMembers(a.interrupted, b.interrupted) &&
  sameMembers(a.moving, b.moving) &&
  sameMembers(a.ready, b.ready);

function Row(
  props: RowActions & {
    clear?: () => void;
    delivery: Delivery;
    online: boolean;
    compact?: boolean;
  },
) {
  const runtime = useContext(RuntimeContext);
  const live = liveDelivery(props);
  const moving = () => groupOf(live.kind()) === "moving";
  const retryFailed = () => {
    for (const transfer of props.delivery.transfers) {
      if (transfers[transfer.id]?.phase === "failed") {
        runtime.runFork(Uploads.use((uploads) => uploads.retry(transfer.id)));
      }
    }
  };
  return (
    <li
      class={cx(
        "row-in",
        css({
          "&:has([data-open]:focus-visible)": {
            outline: "[2px solid var(--colors-blue)]",
            outlineOffset: "[2px]",
          },
          _hover: { shadow: "paperLift", translate: "[0 -1px]" },
          _motionReduce: { _hover: { translate: "[none]" } },
          alignItems: "center",
          bg: "panel",
          borderRadius: "2xl",
          columnGap: "3.5",
          display: "grid",
          gridTemplateColumns: "[auto minmax(0,1fr) auto]",
          pos: "relative",
          px: "4",
          py: "3.5",
          shadow: "paperRow",
          transitionDuration: "fast",
          transitionProperty: "[box-shadow,translate]",
          transitionTimingFunction: "smooth",
        }),
        props.compact === true && css({ bg: "panel/60", py: "2.5" }),
      )}
    >
      <KindIcon kind={live.kind()} />
      <div class={css({ minW: "0" })}>
        {/* The title button covers the whole card, so the row opens on any
            click while the copy button above it stays its own target. */}
        <button
          class={css({
            _after: { content: "''", inset: "0", pos: "absolute" },
            _focusVisible: { outline: "none" },
            display: "block",
            fontSize: "15",
            fontWeight: "semibold",
            maxW: "full",
            textAlign: "left",
            truncate: true,
          })}
          data-open=""
          onClick={() => {
            props.select(props.delivery.id);
          }}
          type="button"
        >
          {props.delivery.title}
        </button>
        <p
          class={css({
            "& > span": { whiteSpace: "nowrap" },
            color: "mut",
            display: "flex",
            flexWrap: "wrap",
            fontFamily: "mono",
            fontSize: "13",
            fontVariantNumeric: "tabular-nums",
            gap: "[0 8px]",
            mt: "0.5",
          })}
        >
          <span>
            {files(props.delivery.transfers.length)} ·{" "}
            {live.kind() === "needsFile"
              ? `${bytes(live.roll().confirmed)} of ${bytes(live.total())} arrived`
              : bytes(live.total())}
          </span>
          <Switch>
            <Match when={live.kind() === "ready" ? props.delivery.expiresAt : null}>
              {(expiresAt) => (
                <>
                  <span>
                    expires {fromNow(expiresAt())}
                    <span class={css({ display: { base: "none", sm: "inline" } })}>
                      , {shortDate.format(expiresAt())}
                    </span>
                  </span>
                  <span>{downloadWords(props.delivery)}</span>
                </>
              )}
            </Match>
            <Match when={live.kind() === "moving"}>
              <span class={kindText("moving")}>
                {speedAt(live.roll().speed)} ·{" "}
                {etaAt(live.total() - live.roll().confirmed, live.roll().speed)} left
              </span>
            </Match>
            <Match when={live.kind() !== "ready"}>
              <span class={kindText(live.kind())}>{kindWords[live.kind()].label}</span>
            </Match>
          </Switch>
        </p>
        <Show when={moving() || live.kind() === "needsFile"}>
          <Progress
            class={css({ mt: "2.5" })}
            confirmed={live.roll().confirmed}
            inFlight={live.roll().inFlight}
            kind={live.kind()}
            label={`${props.delivery.title} upload`}
            total={live.total()}
          />
        </Show>
      </div>
      {/* One primary action per state, always in this slot. Everything else
          (cancel included) lives in the delivery sheet. */}
      <Show
        when={live.kind() === "interrupted"}
        fallback={
          <div class={slot}>
            <Switch>
              <Match when={live.kind() === "ready"}>
                <CopyLink link={props.delivery.link} variant="fill" />
              </Match>
              <Match when={live.kind() === "failed"}>
                <Button onClick={retryFailed} size="sm">
                  Retry
                </Button>
              </Match>
              <Match when={live.kind() === "needsFile"}>
                <Button
                  onClick={() => {
                    props.select(props.delivery.id);
                  }}
                  size="sm"
                >
                  Continue
                </Button>
              </Match>
              <Match when={props.clear !== undefined}>
                <Button
                  onClick={() => {
                    props.clear?.();
                  }}
                  size="sm"
                  variant="outline"
                >
                  Clear
                </Button>
              </Match>
              <Match when={moving()}>
                <span
                  class={css({
                    fontFamily: "mono",
                    fontSize: "15",
                    fontVariantNumeric: "tabular-nums",
                    minW: "[4ch]",
                    textAlign: "right",
                  })}
                >
                  {live.total() === 0
                    ? 0
                    : Math.floor((live.roll().confirmed / live.total()) * 100)}
                  %
                </span>
              </Match>
            </Switch>
          </div>
        }
      >
        <StartOver
          cancel={props.cancel}
          deliveryId={props.delivery.id}
          sendAgain={props.sendAgain}
        />
      </Show>
    </li>
  );
}

const list = css({ display: "grid", gap: "2.5", listStyle: "none", mt: "3" });

function Section(props: { children: JSX.Element; count: number; note?: string; title: string }) {
  return (
    <section>
      <h2 class={sectionTitle}>
        {props.title} <span class={count}>{props.count}</span>
      </h2>
      <Show when={props.note}>
        {(note) => <p class={css({ color: "mut", mt: "1", textStyle: "sm" })}>{note()}</p>}
      </Show>
      {props.children}
    </section>
  );
}

export function Board(
  props: RowActions & {
    clear: (deliveryIds: readonly DeliveryId[]) => Promise<string | undefined>;
    deliveries: readonly Delivery[];
    online: boolean;
  },
) {
  const [endedOpen, setEndedOpen] = createSignal(false);
  const [clearProblem, setClearProblem] = createSignal<string>();
  // Rows leave the list at once; only a failure comes back, and it shows
  // under the Ended heading where both clear buttons live.
  const clear = async (deliveryIds: readonly DeliveryId[]) => {
    setClearProblem(undefined);
    setClearProblem(await props.clear(deliveryIds));
  };
  // Grouping reads live progress, so a finished upload moves to "Ready"
  // the moment the refreshed list says so.
  const groups = createMemo(
    () => {
      const byGroup: Record<Group, Delivery[]> = {
        ended: [],
        interrupted: [],
        moving: [],
        ready: [],
      };
      for (const delivery of props.deliveries) {
        const roll = rollup(delivery, (id) => transfers[id]);
        byGroup[groupOf(kindOf(delivery.status, roll, props.online))].push(delivery);
      }
      return byGroup;
      // Progress ticks rerun this, but rarely move a delivery between groups;
      // unchanged membership stops here instead of re-diffing every list.
    },
    { equals: sameGroups, name: "Board.groups" },
  );

  return (
    <div class={css({ display: "grid", gap: "10" })}>
      <Show when={groups().moving.length > 0}>
        <Section count={groups().moving.length} title="Moving now">
          <ul class={list}>
            <For each={groups().moving}>
              {(delivery) => (
                <Row
                  delivery={delivery}
                  online={props.online}
                  select={props.select}
                  cancel={props.cancel}
                  sendAgain={props.sendAgain}
                />
              )}
            </For>
          </ul>
        </Section>
      </Show>
      <Show when={groups().ready.length > 0}>
        <Section count={groups().ready.length} title="Ready to share">
          <ul class={list}>
            <For each={groups().ready}>
              {(delivery) => (
                <Row
                  delivery={delivery}
                  online={props.online}
                  select={props.select}
                  cancel={props.cancel}
                  sendAgain={props.sendAgain}
                />
              )}
            </For>
          </ul>
        </Section>
      </Show>
      <Show when={groups().interrupted.length > 0}>
        <Section
          count={groups().interrupted.length}
          note="Pick the original files again to continue from what already arrived."
          title="Interrupted"
        >
          <ul class={list}>
            <For each={groups().interrupted}>
              {(delivery) => (
                <Row
                  compact
                  delivery={delivery}
                  online={props.online}
                  select={props.select}
                  cancel={props.cancel}
                  sendAgain={props.sendAgain}
                />
              )}
            </For>
          </ul>
        </Section>
      </Show>
      <Show when={groups().ended.length > 0}>
        <section>
          <div class={css({ alignItems: "center", display: "flex", gap: "3" })}>
            <h2 class={sectionTitle}>
              <button
                aria-controls="ended-list"
                aria-expanded={endedOpen() ? "true" : "false"}
                class={css({
                  _hover: { color: "ink" },
                  alignItems: "center",
                  color: "mut",
                  display: "flex",
                  gap: "2",
                })}
                onClick={() => {
                  setEndedOpen((open) => !open);
                }}
                type="button"
              >
                Ended <span class={count}>{groups().ended.length}</span>
                <PhCaretDownBold
                  class={cx(
                    css({
                      boxSize: "3.5",
                      transitionDuration: "fast",
                      transitionProperty: "[rotate]",
                      transitionTimingFunction: "smooth",
                    }),
                    endedOpen() && css({ rotate: "[180deg]" }),
                  )}
                />
              </button>
            </h2>
            <Button
              css={{ ml: "auto" }}
              onClick={() => {
                void clear(groups().ended.map((delivery) => delivery.id));
              }}
              size="xs"
              variant="outline"
            >
              Clear all
            </Button>
          </div>
          <Show when={clearProblem()}>
            {(message) => (
              <p class={css({ color: "rust", mt: "2", textStyle: "sm" })} role="alert">
                {message()}
              </p>
            )}
          </Show>
          <Show when={endedOpen()}>
            <ul class={list} id="ended-list">
              <For each={groups().ended}>
                {(delivery) => (
                  <Row
                    cancel={props.cancel}
                    clear={() => {
                      void clear([delivery.id]);
                    }}
                    compact
                    delivery={delivery}
                    online={props.online}
                    select={props.select}
                    sendAgain={props.sendAgain}
                  />
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>
    </div>
  );
}

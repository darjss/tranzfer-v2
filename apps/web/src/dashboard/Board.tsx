import type { Delivery, DeliveryId } from "@tranzfer/contracts";
import * as Exit from "effect/Exit";
import { createMemo, createSignal, For, Match, Show, Switch, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { css, cx } from "styled-system/css";

import PhCaretDownBold from "~icons/ph/caret-down-bold";

import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { Button } from "../ui/Button";
import { transfers } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import {
  bytes,
  etaAt,
  files,
  fromNow,
  groupOf,
  kindOf,
  kindWords,
  rollup,
  speedAt,
  totalSize,
} from "./format";
import type { Group } from "./format";
import { CopyLink, KindIcon, kindText, Progress } from "./parts";

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  weekday: "short",
});

/** A delivery's live state: server status plus whatever this tab is uploading. */
export const liveDelivery = (source: { readonly delivery: Delivery; readonly online: boolean }) => {
  const roll = createMemo(() => rollup(source.delivery, (id) => transfers[id]));
  const kind = createMemo(() => kindOf(source.delivery.status, roll(), source.online));
  const total = createMemo(() => totalSize(source.delivery));
  return { kind, roll, total };
};

const sectionTitle = css({
  alignItems: "baseline",
  display: "flex",
  fontSize: "17",
  fontWeight: "semibold",
  gap: "2",
  letterSpacing: "snug",
});

const count = css({ color: "mut", fontFamily: "mono", fontSize: "13", fontWeight: "normal" });

/**
 * The group note tells people to cancel an interrupted delivery and send the
 * files again, so both actions sit on the row. Cancel confirms in place, the
 * same way the sheet does.
 */
function InterruptedActions(props: {
  changed: () => void;
  deliveryId: DeliveryId;
  sendAgain: () => void;
}) {
  const runtime = useContext(RuntimeContext);
  const [confirming, setConfirming] = createSignal(false);
  const [cancelling, setCancelling] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  const cancel = async () => {
    setCancelling(true);
    setProblem(undefined);
    const { deliveryId } = props;
    const exit = await runtime.runPromiseExit(Uploads.use((uploads) => uploads.cancel(deliveryId)));
    setCancelling(false);
    if (Exit.isFailure(exit)) {
      setProblem(appError(exit.cause).message);
      return;
    }
    props.changed();
  };
  return (
    <div
      class={css({
        alignItems: "center",
        display: "flex",
        flexWrap: "wrap",
        gap: "2",
        mt: "2.5",
        pos: "relative",
        zIndex: 1,
      })}
    >
      <Show
        when={confirming()}
        fallback={
          <>
            <Button
              onClick={() => {
                setConfirming(true);
              }}
              size="xs"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                props.sendAgain();
              }}
              size="xs"
              variant="outline"
            >
              Send again
            </Button>
          </>
        }
      >
        <span class={css({ fontWeight: "medium", textStyle: "sm", w: "full" })}>
          Cancel it? The link stops working and the files are deleted.
        </span>
        <Button
          disabled={cancelling()}
          onClick={() => {
            void cancel();
          }}
          size="xs"
          variant="danger"
        >
          {cancelling() ? "Cancelling…" : "Yes, cancel it"}
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
  );
}

interface RowActions {
  readonly changed: () => void;
  readonly select: (id: string) => void;
  readonly sendAgain: () => void;
}

function Row(
  props: RowActions & {
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
            {files(props.delivery.transfers.length)} · {bytes(live.total())}
          </span>
          <Switch>
            <Match when={live.kind() === "ready" ? props.delivery.expiresAt : null}>
              {(expiresAt) => (
                <span>
                  expires {fromNow(expiresAt())}
                  <span class={css({ display: { base: "none", sm: "inline" } })}>
                    , {shortDate.format(expiresAt())}
                  </span>
                </span>
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
        <Show when={moving()}>
          <Progress
            class={css({ mt: "2.5" })}
            confirmed={live.roll().confirmed}
            inFlight={live.roll().inFlight}
            kind={live.kind()}
            label={`${props.delivery.title} upload`}
            total={live.total()}
          />
        </Show>
        <Show when={live.kind() === "interrupted"}>
          <InterruptedActions
            changed={props.changed}
            deliveryId={props.delivery.id}
            sendAgain={props.sendAgain}
          />
        </Show>
      </div>
      <div
        class={css({ alignItems: "center", display: "flex", gap: "2", pos: "relative", zIndex: 1 })}
      >
        <Switch>
          <Match when={live.kind() === "ready"}>
            <CopyLink link={props.delivery.link} variant="fill" />
          </Match>
          <Match when={live.kind() === "failed"}>
            <Button onClick={retryFailed} size="sm" variant="outline">
              Retry
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
              {live.total() === 0 ? 0 : Math.floor((live.roll().confirmed / live.total()) * 100)}%
            </span>
          </Match>
        </Switch>
      </div>
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
    deliveries: readonly Delivery[];
    online: boolean;
  },
) {
  // Grouping reads live progress, so a finished upload moves to "Ready"
  // the moment the refreshed list says so.
  const groups = createMemo(() => {
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
  });

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
                  changed={props.changed}
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
                  changed={props.changed}
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
          note="This browser can't resume these yet. Cancel them and send the files again."
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
                  changed={props.changed}
                  sendAgain={props.sendAgain}
                />
              )}
            </For>
          </ul>
        </Section>
      </Show>
      <Show when={groups().ended.length > 0}>
        <details>
          <summary
            class={cx(
              sectionTitle,
              css({
                "&::-webkit-details-marker": { display: "none" },
                _hover: { color: "ink" },
                alignItems: "center",
                color: "mut",
                cursor: "pointer",
                listStyle: "none",
                w: "fit",
              }),
            )}
          >
            Ended <span class={count}>{groups().ended.length}</span>
            <PhCaretDownBold
              class={css({
                boxSize: "3.5",
                "details[open] &": { rotate: "[180deg]" },
                transitionDuration: "fast",
                transitionProperty: "[rotate]",
                transitionTimingFunction: "smooth",
              })}
            />
          </summary>
          <ul class={list}>
            <For each={groups().ended}>
              {(delivery) => (
                <Row
                  compact
                  delivery={delivery}
                  online={props.online}
                  select={props.select}
                  changed={props.changed}
                  sendAgain={props.sendAgain}
                />
              )}
            </For>
          </ul>
        </details>
      </Show>
    </div>
  );
}

import type { Delivery, DeliveryId } from "@tranzfer/contracts";
import * as Exit from "effect/Exit";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from "solid-js";
import { css, cx } from "styled-system/css";

import PhXBold from "~icons/ph/x-bold";

import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { Button } from "../ui/Button";
import { transfers } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import { liveDelivery } from "./deliveries";
import {
  bytes,
  etaAt,
  files,
  fromNow,
  kindWords,
  sentAt,
  speedAt,
  transferStatus,
  untilDate,
} from "./format";
import type { Kind } from "./format";
import { CopyLink, KindIcon, kindText, Progress } from "./parts";
import "./dashboard.css";

const block = css({
  borderColor: "line",
  borderTopWidth: "1px",
  px: { base: "5", sm: "7" },
  py: "6",
});
const heading = css({ fontWeight: "semibold", textStyle: "sm" });

const fileKind = {
  Active: "moving",
  Cancelled: "cancelled",
  Complete: "ready",
  Failed: "failed",
  Interrupted: "interrupted",
  NeedsFile: "needsFile",
} satisfies Record<ReturnType<typeof transferStatus>["_tag"], Kind>;

const resumeProblem = (problem: "changed" | "policy" | "unreadable" | "unknown", name: string) => {
  if (problem === "unknown") {
    return `"${name}" isn't one of the files this delivery is waiting for.`;
  }
  if (problem === "changed") {
    return `"${name}" has changed since you sent it, so we won't continue with it.`;
  }
  if (problem === "unreadable") {
    return `"${name}" couldn't be read. Pick it again.`;
  }
  return `"${name}" was started by an older version of Tranzfer and can't continue. Cancel and send it again.`;
};

function Details(props: {
  cancel: (deliveryId: DeliveryId) => Promise<string | undefined>;
  delivery: Delivery;
  online: boolean;
}) {
  const runtime = useContext(RuntimeContext);
  const live = liveDelivery(props);
  const [confirming, setConfirming] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  const [resumeProblems, setResumeProblems] = createSignal<readonly string[]>([]);
  const shareable = () => props.delivery.status === "open" || props.delivery.status === "ready";
  // Folder picks matter only when a transfer actually sits in one.
  const hasNestedPaths = () =>
    props.delivery.transfers.some((transfer) => transfer.path.includes("/"));
  let resumeFiles: HTMLInputElement | undefined;
  let resumeFolder: HTMLInputElement | undefined;

  const resumePicked = async (input: HTMLInputElement) => {
    const picked = [...(input.files ?? [])];
    input.value = "";
    if (picked.length === 0) {
      return;
    }
    const { delivery } = props;
    const exit = await runtime.runPromiseExit(
      Uploads.use((uploads) => uploads.resume(delivery, picked)),
    );
    setResumeProblems(
      Exit.isSuccess(exit)
        ? exit.value.map(({ name, problem: tag }) => resumeProblem(tag, name))
        : [appError(exit.cause).message],
    );
  };

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
      <section class={cx(block, css({ borderTopWidth: "0", pt: "2" }))}>
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

      <Show when={live.roll().needsFile}>
        <section class={block}>
          <h3 class={heading}>Continue the upload</h3>
          <p class={css({ color: "ink/80", mt: "2", textStyle: "sm" })}>
            {bytes(live.roll().confirmed)} already uploaded.
          </p>
          <div class={css({ display: "flex", flexWrap: "wrap", gap: "2.5", mt: "3" })}>
            <Button
              onClick={() => {
                resumeFiles?.click();
              }}
              size="sm"
            >
              Choose files
            </Button>
            <Show when={hasNestedPaths()}>
              <Button
                onClick={() => {
                  resumeFolder?.click();
                }}
                size="sm"
                variant="outline"
              >
                Choose folder
              </Button>
            </Show>
          </div>
          <input
            class={css({ display: "none" })}
            multiple
            onChange={(event) => {
              void resumePicked(event.currentTarget);
            }}
            ref={(element) => {
              resumeFiles = element;
            }}
            type="file"
          />
          <Show when={hasNestedPaths()}>
            <input
              class={css({ display: "none" })}
              onChange={(event) => {
                void resumePicked(event.currentTarget);
              }}
              ref={(element) => {
                resumeFolder = element;
              }}
              type="file"
              webkitdirectory=""
            />
          </Show>
          <Show when={resumeProblems().length > 0}>
            <ul
              class={css({ color: "rust", listStyle: "none", mt: "3", textStyle: "sm" })}
              role="alert"
            >
              <For each={resumeProblems()}>{(message) => <li>{message}</li>}</For>
            </ul>
          </Show>
        </section>
      </Show>

      <section class={block}>
        <h3 class={heading}>Link</h3>
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
      </section>

      <section class={block}>
        <h3 class={heading}>
          Files{" "}
          <span class={css({ color: "mut", fontFamily: "mono", fontWeight: "normal" })}>
            {files(props.delivery.transfers.length)}
          </span>
        </h3>
        <ul class={css({ display: "grid", listStyle: "none", mt: "2" })}>
          <For each={props.delivery.transfers}>
            {(transfer) => {
              const status = createMemo(() => transferStatus(transfer, transfers[transfer.id]));
              const kind = () => fileKind[status()._tag];
              return (
                <li
                  class={css({
                    alignItems: "center",
                    borderBottomWidth: "1px",
                    borderColor: "line/70",
                    columnGap: "3",
                    display: "grid",
                    gridTemplateColumns: "[auto minmax(0,1fr) auto]",
                    py: "2.5",
                  })}
                >
                  <KindIcon class={css({ boxSize: "6" })} kind={kind()} />
                  <div class={css({ minW: "0" })}>
                    <p
                      class={css({ fontFamily: "mono", fontSize: "13", truncate: true })}
                      title={transfer.path}
                    >
                      {transfer.path}
                    </p>
                    <Switch>
                      <Match when={status()._tag === "Active" ? transfers[transfer.id] : undefined}>
                        {(progress) => (
                          <Progress
                            class={css({ mt: "1.5" })}
                            confirmed={progress().confirmed}
                            inFlight={progress().inFlight}
                            kind="moving"
                            label={`${transfer.path} upload`}
                            total={transfer.size}
                          />
                        )}
                      </Match>
                      <Match when={status()._tag === "Failed" ? transfers[transfer.id] : undefined}>
                        {(progress) => (
                          <p class={css({ color: "rust", fontSize: "13", mt: "0.5" })}>
                            {appError(progress().error).message}
                          </p>
                        )}
                      </Match>
                      <Match
                        when={status()._tag === "NeedsFile" ? transfers[transfer.id] : undefined}
                      >
                        {(progress) => (
                          <Show
                            when={progress().error !== undefined}
                            fallback={
                              <p class={cx(css({ fontSize: "13", mt: "0.5" }), kindText(kind()))}>
                                {kindWords[kind()].label}
                              </p>
                            }
                          >
                            <p class={css({ color: "rust", fontSize: "13", mt: "0.5" })}>
                              {appError(progress().error).message}
                            </p>
                          </Show>
                        )}
                      </Match>
                      <Match when={status()._tag !== "Complete"}>
                        <p class={cx(css({ fontSize: "13", mt: "0.5" }), kindText(kind()))}>
                          {kindWords[kind()].label}
                        </p>
                      </Match>
                    </Switch>
                  </div>
                  <div class={css({ alignItems: "center", display: "flex", gap: "3" })}>
                    <Show when={status()._tag === "Failed"}>
                      <Button
                        onClick={() => {
                          runtime.runFork(Uploads.use((uploads) => uploads.retry(transfer.id)));
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Retry
                      </Button>
                    </Show>
                    <span
                      class={css({
                        color: "mut",
                        fontFamily: "mono",
                        fontSize: "13",
                        fontVariantNumeric: "tabular-nums",
                      })}
                    >
                      {bytes(transfer.size)}
                    </span>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </section>

      <Show when={shareable()}>
        <section class={cx(block, css({ pb: "10" }))}>
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
                  sent {sentAt(delivery().createdAt)} · kept {delivery().retentionDays}{" "}
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
            <Details cancel={props.cancel} delivery={delivery()} online={props.online} />
          </div>
        )}
      </Show>
    </dialog>
  );
}

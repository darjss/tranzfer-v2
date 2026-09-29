import { Meta, Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { clientOnly } from "@solidjs/web";
import { defaultRetentionDays } from "@tranzfer/contracts";
import type { RetentionDays } from "@tranzfer/contracts";
import { createMemo, createSignal, Errored, Loading, onSettled, Show, useContext } from "solid-js";
import { css, cx } from "styled-system/css";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { runEffect, RuntimeContext } from "../api/solid-effect";
import { Board } from "../dashboard/Board";
import { createDeliveries } from "../dashboard/deliveries";
import { DeliverySheet } from "../dashboard/DeliverySheet";
import { SendCard } from "../dashboard/SendCard";
import { TopBar } from "../dashboard/TopBar";
import { inkStrokes } from "../landing/notebook";
import { online, wireWindow } from "../uploads/store";
import { chosenFiles, getDroppedFiles, invalidPaths } from "../uploads/uploads";
import "../dashboard/dashboard.css";

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") === true;

const Redirect = (props: { to: string }) => {
  const navigate = useNavigate();
  onSettled(() => {
    navigate(props.to, { replace: true });
  });
  return null;
};

// First run, or nothing live right now: one warm note, no fake data.
const Empty = (props: { firstRun: boolean }) => (
  <div
    class={css({
      bg: "panel",
      borderRadius: "photo",
      maxW: "[420px]",
      mb: "12",
      mt: { base: "4", lg: "16" },
      mx: "auto",
      pos: "relative",
      px: "7",
      py: "8",
      rotate: "[1.5deg]",
      shadow: "paper",
    })}
  >
    <span aria-hidden="true" class="tape" />
    <p
      class={css({
        color: "blue",
        fontFamily: "hand",
        fontSize: "26",
        fontWeight: "semibold",
        lineHeight: "compact",
        rotate: "[-2deg]",
      })}
    >
      {props.firstRun ? "your first delivery lands here" : "all quiet on the desk"}
    </p>
    <h2 class={css({ fontWeight: "semibold", mt: "4" })}>
      {props.firstRun ? "Nothing sent yet." : "Nothing moving right now."}
    </h2>
    <p class={css({ color: "mut", mt: "1.5", textStyle: "sm" })}>
      Drop files on the card. They show up here with live progress, then a link you can copy and
      send to anyone.
    </p>
  </div>
);

const DeliveriesPage = () => {
  const runtime = useContext(RuntimeContext);
  const [searchParams, setSearchParams] = useSearchParams<{ d?: string }>();
  const select = (id?: string) => {
    setSearchParams({ d: id });
  };

  const me = createMemo(() => runEffect(ApiClient.use((api) => api.Me())));
  const { cancel, deliveries, send, sending } = createDeliveries(runtime);
  const selected = () => {
    const id = searchParams.d;
    return id === undefined ? undefined : deliveries.find((delivery) => delivery.id === id);
  };
  const hasLive = () =>
    deliveries.some((delivery) => delivery.status === "open" || delivery.status === "ready");

  const [retention, setRetention] = createSignal<RetentionDays>(defaultRetentionDays);
  const [problems, setProblems] = createSignal<readonly string[]>([]);
  const [dragging, setDragging] = createSignal(false);
  let filesInput: HTMLInputElement | undefined;
  let folderInput: HTMLInputElement | undefined;

  const pick = async (picked: Iterable<File>) => {
    if (sending()) {
      return;
    }
    const chosen = chosenFiles(picked);
    if (chosen.length === 0) {
      return;
    }
    const bad = invalidPaths(chosen);
    if (bad.length > 0) {
      setProblems(bad.map((path) => `"${path}" isn't a path we can carry safely.`));
      return;
    }
    setProblems([]);
    const failure = await send(chosen, retention());
    if (failure !== undefined) {
      setProblems([`${failure} Nothing was uploaded.`]);
    }
  };

  const sendDropped = async (dropped: DataTransfer) => {
    await pick(await getDroppedFiles(dropped));
  };

  // The whole window is the drop target. dragleave with no relatedTarget
  // means the pointer left the window, not just moved between children.
  onSettled(() => {
    wireWindow();
    const over = (event: DragEvent) => {
      if (hasFiles(event)) {
        event.preventDefault();
        setDragging(true);
      }
    };
    const leave = (event: DragEvent) => {
      if (event.relatedTarget === null) {
        setDragging(false);
      }
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event) || event.dataTransfer === null) {
        return;
      }
      event.preventDefault();
      setDragging(false);
      void sendDropped(event.dataTransfer);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  });

  const onPicked = (event: Event & { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    void pick([...(input.files ?? [])]);
    input.value = "";
  };

  return (
    <>
      <Title>Deliveries · Tranzfer</Title>
      <Meta name="description" content="Your Tranzfer deliveries." />
      <Loading fallback={<main class={css({ minH: "screen" })} />}>
        <Errored
          fallback={(error, retry) => (
            <Show
              when={appError(error()).tag === "Unauthorized"}
              fallback={
                <main
                  class={css({ display: "grid", minH: "screen", placeItems: "center" })}
                  role="alert"
                >
                  <div class={css({ textAlign: "center" })}>
                    <p class={css({ color: "mut", textStyle: "sm" })}>
                      {appError(error()).message}
                    </p>
                    <button
                      class={css({ color: "ink", mt: "3", textDecoration: "underline" })}
                      onClick={retry}
                      type="button"
                    >
                      Try again
                    </button>
                  </div>
                </main>
              }
            >
              <Redirect to="/sign-in" />
            </Show>
          )}
        >
          <div
            class={css({
              marginInline: "auto",
              maxW: "page",
              minH: "screen",
              pb: "24",
              px: { base: "5", sm: "7" },
            })}
          >
            <TopBar
              principal={me()}
              send={() => {
                filesInput?.click();
              }}
            />
            <Show when={!online()}>
              <p
                class={css({
                  bg: "amber/10",
                  borderRadius: "xl",
                  color: "[#8a4f00]",
                  fontWeight: "medium",
                  mt: "4",
                  px: "4",
                  py: "2.5",
                  textStyle: "sm",
                })}
                role="status"
              >
                Connection lost. We'll continue when you're back online.
              </p>
            </Show>
            <main
              class={css({
                alignItems: "start",
                display: "grid",
                gap: { base: "10", lg: "16" },
                gridTemplateColumns: { base: "1fr", lg: "[minmax(0,5fr) minmax(0,6fr)]" },
                pt: { base: "6", lg: "12" },
              })}
            >
              <div class={css({ lg: { pos: "sticky", top: "8" } })}>
                <h1
                  class={cx(
                    css({
                      fontSize: { base: "[34px]", lg: "[56px]" },
                      fontWeight: "semibold",
                      letterSpacing: "[-0.04em]",
                      lineHeight: "[.98]",
                      mb: { base: "6", lg: "4" },
                      textWrap: "balance",
                    }),
                    // The board leads on phones, so the heading steps aside.
                    hasLive() && css({ lgDown: { srOnly: true } }),
                  )}
                >
                  Send something <br />
                  <span class={css({ display: "inline-block", pos: "relative" })}>
                    <span class={css({ color: "blue", fontStyle: "italic" })}>big.</span>
                    <svg
                      aria-hidden="true"
                      class={cx(
                        "in",
                        inkStrokes,
                        css({
                          bottom: "-1.5",
                          color: "blue",
                          h: "3.5",
                          left: "-1",
                          opacity: 0.8,
                          overflow: "visible",
                          pointerEvents: "none",
                          pos: "absolute",
                          right: "-1",
                        }),
                      )}
                      preserveAspectRatio="none"
                      viewBox="0 0 120 20"
                    >
                      <path d="M3 14 C 30 5, 70 17, 117 7" style="--len:130" />
                    </svg>
                  </span>
                </h1>
                <SendCard
                  dragging={dragging()}
                  pickFiles={() => {
                    filesInput?.click();
                  }}
                  pickFolder={() => {
                    folderInput?.click();
                  }}
                  problems={problems()}
                  retention={retention()}
                  sending={sending()}
                  setRetention={(days) => {
                    setRetention(days);
                  }}
                />
              </div>
              {/* On phones, live deliveries come first so progress and links
                  sit above the fold; the send card follows. */}
              <div class={cx(hasLive() && css({ lgDown: { order: "-1" } }))}>
                <Show when={!hasLive()}>
                  <Empty firstRun={deliveries.length === 0} />
                </Show>
                <Board
                  cancel={cancel}
                  deliveries={deliveries}
                  online={online()}
                  select={select}
                  sendAgain={() => {
                    filesInput?.click();
                  }}
                />
              </div>
            </main>
          </div>
          <input
            class={css({ display: "none" })}
            multiple
            onChange={onPicked}
            ref={(element) => {
              filesInput = element;
            }}
            type="file"
          />
          <input
            class={css({ display: "none" })}
            onChange={onPicked}
            ref={(element) => {
              folderInput = element;
            }}
            type="file"
            webkitdirectory=""
          />
          <div
            aria-hidden="true"
            class={cx(
              "drop-veil",
              css({
                bg: "paper/70",
                borderColor: "blue",
                borderRadius: "card",
                borderStyle: "dashed",
                borderWidth: "[2px]",
                inset: "3",
                pos: "fixed",
                zIndex: 50,
              }),
            )}
            data-on={String(dragging())}
          />
          <DeliverySheet
            cancel={cancel}
            close={() => {
              select();
            }}
            delivery={selected()}
            online={online()}
          />
        </Errored>
      </Loading>
    </>
  );
};

// Uppy and the window listeners are browser-only, so the dashboard mounts
// on the client; the server renders the empty shell.
const LazyDeliveries = clientOnly(async () => await Promise.resolve({ default: DeliveriesPage }));

export default function Deliveries() {
  return <LazyDeliveries fallback={<main class={css({ minH: "screen" })} />} />;
}

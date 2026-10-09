import { Meta, Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { clientOnly } from "@solidjs/web";
import { AccessCodeInput, defaultRetentionDays, PaidPlanId, plans } from "@tranzfer/contracts";
import type { RetentionDays } from "@tranzfer/contracts";
import * as Schema from "effect/Schema";
import {
  configureClientErrors,
  createEffect,
  createMemo,
  createSignal,
  Errored,
  Loading,
  onSettled,
  refresh,
  Show,
  useContext,
} from "solid-js";
import { css, cx } from "styled-system/css";

import { ApiClient } from "../api/client";
import { appError, reportFailure } from "../api/errors";
import { runEffect, RuntimeContext } from "../api/solid-effect";
import { Board } from "../dashboard/Board";
import { goToCheckout, goToPortal } from "../dashboard/billing";
import { createDeliveries } from "../dashboard/deliveries";
import { DeliverySheet } from "../dashboard/DeliverySheet";
import { SendCard } from "../dashboard/SendCard";
import { SendDoneList } from "../dashboard/SendDone";
import { TopBar } from "../dashboard/TopBar";
import { inkStrokes } from "../landing/notebook";
import { online, wireWindow } from "../uploads/store";
import { chosenFiles, getDroppedFiles } from "../uploads/uploads";
import { bytes } from "../dashboard/format";
import { button } from "../ui/Button";
import { paidPlansOpen } from "../ui/support";
import DashboardLoading from "../dashboard/DashboardLoading";
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

// The toast module stays out of the server bundle; see ui/Toasts.tsx.
const welcome = async (plan: PaidPlanId) => {
  const { toaster } = await import("../ui/Toasts");
  toaster.success({
    description: `${bytes(plans[plan].activeBytes)} at once, links up to ${plans[plan].maxRetentionDays} days.`,
    title: `You're on ${plans[plan].name}`,
  });
};

const DeliveriesPage = () => {
  const runtime = useContext(RuntimeContext);
  const [searchParams, setSearchParams] = useSearchParams<{
    checkout?: string;
    code?: string;
    d?: string;
    plan?: string;
  }>();
  const select = (id?: string) => {
    setSearchParams({ d: id });
  };

  // The fallback below only says "didn't load". Solid hands the boundary's
  // real error to this hook once, with the owner path of whatever threw.
  onSettled(() => {
    configureClientErrors({
      onError: (error, { ownerPath }) => {
        runtime.runFork(reportFailure(error, ownerPath));
      },
    });
    return () => {
      configureClientErrors({});
    };
  });

  const me = createMemo(() => runEffect(ApiClient.use((api) => api.Me())));
  const {
    billing,
    cancel,
    clear,
    deliveries,
    dismiss,
    finished,
    redeem,
    redeeming,
    send,
    sending,
    update,
  } = createDeliveries(runtime);
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
    setProblems([]);
    const failure = await send(chosen, retention());
    if (failure !== undefined) {
      setProblems([`${failure} Nothing was uploaded.`]);
      return;
    }
    const { toaster } = await import("../ui/Toasts");
    toaster.success({
      description: "Close the tab if you have to. It picks up where it left off.",
      title: chosen.length === 1 ? "Sending 1 file" : `Sending ${chosen.length} files`,
    });
  };

  const upgrade = async (plan: PaidPlanId) => {
    const problem = await goToCheckout(runtime, plan);
    if (problem !== undefined) {
      const { toaster } = await import("../ui/Toasts");
      toaster.error({ description: problem.message, title: "Checkout didn't open" });
    }
  };
  const manage = async () => {
    const problem = await goToPortal(runtime);
    if (problem !== undefined) {
      const { toaster } = await import("../ui/Toasts");
      toaster.error({ description: problem.message, title: "Billing didn't open" });
    }
  };

  // Signing in from a pricing button lands here with the plan to buy. An old
  // link can carry one while paid plans are closed; it is dropped.
  onSettled(() => {
    const plan = Schema.decodeUnknownOption(PaidPlanId)(searchParams.plan);
    if (plan._tag === "Some") {
      setSearchParams({ plan: undefined });
      if (paidPlansOpen) {
        void upgrade(plan.value);
      }
    }
  });

  // A beta invite (/sign-in?code=) lands here with its code. Drop it from the
  // address first so a reload doesn't try it again.
  onSettled(() => {
    const code = Schema.decodeUnknownOption(AccessCodeInput)(searchParams.code);
    if (code._tag === "Some") {
      setSearchParams({ code: undefined });
      void redeem(code.value);
    }
  });

  // The webhook can land a moment after the checkout redirect, so read the
  // plan again until it changes or a few tries pass.
  createEffect(
    () => searchParams.checkout === "success" && billing().plan === "free",
    (waiting) => {
      let tries = 0;
      const timer = waiting
        ? setInterval(() => {
            tries += 1;
            if (tries > 15) {
              clearInterval(timer);
              return;
            }
            void refresh(billing);
          }, 2000)
        : undefined;
      return () => {
        clearInterval(timer);
      };
    },
  );

  // Back from checkout once the new plan is in: say so once, then drop the
  // query so a reload doesn't say it again.
  createEffect(
    () => (searchParams.checkout === "success" ? billing().plan : "free"),
    (plan) => {
      if (plan !== "free") {
        void welcome(plan);
        setSearchParams({ checkout: undefined });
      }
    },
  );

  const sendDropped = async (dropped: DataTransfer) => {
    await pick(await getDroppedFiles(dropped));
  };

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

  // The whole window is the drop target. dragleave with no relatedTarget
  // means the pointer left the window, not just moved between children.
  onSettled(() => {
    wireWindow();
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
      <Meta name="robots" content="noindex" />
      <Loading fallback={<DashboardLoading />}>
        <Errored
          fallback={(error, retry) => (
            <Show
              when={appError(error()).tag === "Unauthorized"}
              fallback={
                <main
                  class={css({ display: "grid", minH: "screen", placeItems: "center", px: "5" })}
                  role="alert"
                >
                  <div
                    class={css({
                      bg: "panel",
                      borderRadius: "card",
                      maxW: "[440px]",
                      p: "8",
                      rotate: "[-1deg]",
                      shadow: "paper",
                      textAlign: "center",
                    })}
                  >
                    <p
                      class={css({
                        fontSize: "22",
                        fontWeight: "semibold",
                        letterSpacing: "tight",
                      })}
                    >
                      Well, that didn't load.
                    </p>
                    <p class={css({ color: "mut", mt: "2", textStyle: "sm" })}>
                      {appError(error()).message} Your uploads are fine; this is just the list.
                    </p>
                    <button
                      class={button({ size: "sm" })}
                      onClick={retry}
                      type="button"
                      style={{ "margin-top": "20px" }}
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
              billing={billing()}
              manage={() => {
                void manage();
              }}
              principal={me()}
              redeem={redeem}
              redeeming={redeeming()}
              send={() => {
                filesInput?.click();
              }}
              upgrade={(plan) => {
                void upgrade(plan);
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
                  billing={billing()}
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
                  upgrade={(plan) => {
                    void upgrade(plan);
                  }}
                />
              </div>
              {/* On phones, live deliveries come first so progress and links
                  sit above the fold; the send card follows. */}
              <div class={cx(hasLive() && css({ lgDown: { order: "-1" } }))}>
                <Show when={!hasLive()}>
                  <Empty firstRun={deliveries.length === 0} />
                </Show>
                <SendDoneList
                  deliveries={deliveries}
                  dismiss={dismiss}
                  finished={finished()}
                  update={update}
                />
                <Board
                  cancel={cancel}
                  clear={clear}
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
  return <LazyDeliveries fallback={<DashboardLoading />} />;
}

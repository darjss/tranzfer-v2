import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { assertBudget, captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import {
  AccessCodeRefused,
  Api,
  Authenticated,
  CurrentPrincipal,
  DeliveryId,
  TransferId,
} from "@tranzfer/contracts";
import type { BillingSummary, Delivery } from "@tranzfer/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as Struct from "effect/Struct";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as RpcTest from "effect/rpc/RpcTest";
import { createSignal, flush, Loading, onSettled, Show } from "solid-js";

import { ApiClient } from "../api/client";
import { RuntimeContext } from "../api/solid-effect";
import { patchTransfer } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import { Board } from "./Board";
import { SendCard } from "./SendCard";
import { TopBar } from "./TopBar";
import { createDeliveries } from "./deliveries";
import { DeliverySheet } from "./DeliverySheet";

// jsdom never implemented dialog's open/close; the sheet calls both.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const MB = 1_000_000;

const delivery = (
  title: string,
  status: Delivery["status"],
  sizes: readonly number[],
): Delivery => ({
  createdAt: new Date("2026-09-29T08:00:00Z"),
  expiresAt: status === "ready" ? new Date("2026-10-02T08:00:00Z") : null,
  id: DeliveryId.make(crypto.randomUUID()),
  link: `/d/${title}`,
  retentionDays: 3,
  status,
  title,
  transfers: sizes.map((size, index) => ({
    id: TransferId.make(crypto.randomUUID()),
    objectKey: `d/${title}/${index}`,
    path: `${title}/${index}.bin`,
    size,
    state: status === "ready" ? "complete" : "uploading",
  })),
});

// The API side of the dashboard, in memory: a server list the fake cancel
// really changes, behind the typed RPC client the page uses.
const freePlan: BillingSummary = {
  cancelsAtPeriodEnd: false,
  grantEndsAt: null,
  limitBytes: 20_000 * MB,
  maxRetentionDays: 3,
  periodEnd: null,
  plan: "free",
  status: "none",
  usedBytes: 3200 * MB,
};

// What BETA-PRO gives: Pro until 7 January, with no subscription behind it.
const betaEnds = new Date("2027-01-07T12:00:00Z");
const betaPro: BillingSummary = {
  cancelsAtPeriodEnd: false,
  grantEndsAt: betaEnds,
  limitBytes: 1_000_000 * MB,
  maxRetentionDays: 14,
  periodEnd: null,
  plan: "pro",
  status: "none",
  usedBytes: 3200 * MB,
};

const makeWorld = (
  server: Delivery[],
  gate?: Deferred.Deferred<boolean>,
  initialBilling: BillingSummary = freePlan,
) => {
  // Redeeming BETA-PRO changes what the next GetBilling answers, like the real API.
  let billing = initialBilling;
  const api = Layer.effect(ApiClient, RpcTest.makeClient(Api)).pipe(
    Layer.provide(
      Api.toLayer(
        Api.of({
          CancelDelivery: () => Effect.die("unused"),
          // Like the real list, a cleared delivery stops coming back.
          ClearDeliveries: ({ deliveryIds }) =>
            Effect.sync(() => {
              server.splice(
                0,
                server.length,
                ...server.filter((row) => !deliveryIds.includes(row.id)),
              );
            }),
          CreateDelivery: () => Effect.die("unused"),
          Deliveries: () => Effect.sync(() => [...server]),
          FinalizeTransfer: () => Effect.die("unused"),
          GetBilling: () => Effect.sync(() => billing),
          JoinInterest: () => Effect.die("unused"),
          Me: () => Effect.service(CurrentPrincipal),
          OpenBillingPortal: () => Effect.die("unused"),
          OpenLink: () => Effect.die("unused"),
          RedeemCode: ({ code }) =>
            code.trim().toUpperCase() === "BETA-PRO"
              ? Effect.sync(() => {
                  billing = betaPro;
                  return { endsAt: betaEnds, plan: "pro" as const };
                })
              : Effect.fail(new AccessCodeRefused({ reason: "unknown" })),
          SignUpload: () => Effect.die("unused"),
          StartCheckout: () => Effect.die("unused"),
        }),
      ),
    ),
    Layer.provide(
      Layer.succeed(
        Authenticated,
        Authenticated.of((effect) =>
          effect.pipe(
            Effect.provideService(CurrentPrincipal, {
              email: "s@test",
              id: "s",
              image: null,
              name: "Sender",
            }),
          ),
        ),
      ),
    ),
  );
  const uploads = Layer.succeed(
    Uploads,
    Uploads.of({
      cancel: (deliveryId) =>
        Effect.gen(function* fakeCancel() {
          // Hold the reply until the test has looked at the optimistic state.
          if (gate !== undefined) {
            yield* Deferred.await(gate);
          }
          const index = server.findIndex((row) => row.id === deliveryId);
          const row = server[index];
          if (row === undefined) {
            return yield* Effect.die(new Error("unknown delivery"));
          }
          // Like the real cancel, the transfers end with the delivery.
          const cancelled = Struct.evolve(row, {
            status: () => "cancelled" as const,
            transfers: (rows) =>
              rows.map((transfer) =>
                Struct.evolve(transfer, { state: () => "cancelled" as const }),
              ),
          });
          server[index] = cancelled;
          return cancelled;
        }),
      restore: () => Effect.void,
      resume: () => Effect.succeed([]),
      retry: () => Effect.die("unused"),
      send: () => Effect.die("unused"),
    }),
  );
  // The server-side Authenticated middleware reads the incoming request.
  const request = Layer.succeed(
    HttpServerRequest.HttpServerRequest,
    HttpServerRequest.fromWeb(new Request("http://test/rpc")),
  );
  return ManagedRuntime.make(Layer.mergeAll(api, uploads).pipe(Layer.provide(request)));
};

const noop = () => {};
// The fake cancel never fails.
const nothingToReport = async () =>
  await Promise.resolve(Option.getOrUndefined(Option.none<string>()));
// As the dashboard does with /deliveries?code=, once it has settled.
const Landing = (props: { redeem: (code: string) => Promise<string | undefined> }) => {
  onSettled(() => {
    void props.redeem("beta-pro");
  });
  return null;
};

const readyCount = () => screen.getByRole("heading", { name: /Ready to share/u }).textContent;

describe("dashboard reactivity", () => {
  afterEach(cleanup);

  it("a steady-state progress tick updates the moving row and re-runs no conditions", async () => {
    const moving = delivery("Moving", "open", [200 * MB, 100 * MB]);
    const ready = [delivery("ReadyA", "ready", [5 * MB]), delivery("ReadyB", "ready", [7 * MB])];
    const [first, second] = moving.transfers;
    if (first === undefined || second === undefined) {
      throw new Error("fixture needs two transfers");
    }
    // Every transfer has local progress and the first is already at speed, so
    // the row reads as moving and the tick below is steady state.
    patchTransfer(first.id, { bytesPerSecond: 30 * MB, confirmed: 10 * MB, phase: "uploading" });
    patchTransfer(second.id, { phase: "uploading" });
    const runtime = makeWorld([moving, ...ready]);
    render(() => (
      <RuntimeContext value={runtime}>
        <Board
          cancel={nothingToReport}
          clear={nothingToReport}
          deliveries={[moving, ...ready]}
          online
          select={noop}
          sendAgain={noop}
        />
      </RuntimeContext>
    ));

    const { artifact } = await captureArtifact(
      () => {
        patchTransfer(first.id, { bytesPerSecond: 40 * MB, confirmed: 20 * MB, inFlight: 5 * MB });
      },
      { scenario: "progress-tick" },
    );

    // The tick reached the screen: the moving row shows the new speed.
    flush();
    expect(screen.getByText(/40 MB\/s/u)).toBeInTheDocument();
    expect(artifact).toHaveNoDiagnostics();
    // Steady state, one tick: the moving row's rollup recomputes, the two
    // memos that confirm nothing regrouped stop there, and the four bindings
    // that show the new numbers (percent, bar, speed, time left) update. No
    // condition (<Show>/<Match>) re-runs, and only those two confirming memos
    // are allowed to be wasted.
    assertBudget(artifact, { allow: [], maxReruns: 7, maxWastedRuns: 2 });
    const reruns = (artifact.attribution?.reruns ?? []).map((run) => run.nodeName);
    expect(reruns).toEqual(expect.arrayContaining(["Board.groups", "Row.kind", "Row.roll"]));
    expect(reruns).not.toContain("condition value");
    await runtime.dispose();
  });

  it("cancel moves the delivery to Ended before the server answers", async () => {
    const target = delivery("Doomed", "ready", [3 * MB]);
    const gate = Deferred.makeUnsafe<boolean>();
    const server = [target, delivery("Keeper", "ready", [2 * MB])];
    const runtime = makeWorld(server, gate);
    let cancel: ReturnType<typeof createDeliveries>["cancel"] | undefined;
    const Harness = () => {
      const state = createDeliveries(runtime);
      ({ cancel } = state);
      return (
        <Board
          cancel={state.cancel}
          clear={state.clear}
          deliveries={state.deliveries}
          online
          select={noop}
          sendAgain={noop}
        />
      );
    };
    render(() => (
      <RuntimeContext value={runtime}>
        <Loading fallback={<p>loading</p>}>
          <Harness />
        </Loading>
      </RuntimeContext>
    ));
    await screen.findByText("Doomed");
    expect(readyCount()).toContain("2");

    const { artifact, result } = await captureArtifact(
      async () => {
        const pending = cancel?.(target.id);
        flush();
        // Optimistic: already out of Ready while the server is still holding
        // its reply, so the server list has not changed yet.
        expect(readyCount()).toContain("1");
        expect(server.map((row) => row.status)).toEqual(["ready", "ready"]);
        Deferred.doneUnsafe(gate, Effect.succeed(true));
        return await pending;
      },
      { scenario: "cancel" },
    );

    expect(result).toBeUndefined();
    expect(artifact).toHaveNoDiagnostics();
    await runtime.dispose();
  });

  it("a needsFile transfer asks for its files in the sheet", async () => {
    const waiting = delivery("Waiting", "open", [60 * MB]);
    const [transfer] = waiting.transfers;
    if (transfer === undefined) {
      throw new Error("fixture needs a transfer");
    }
    // restore() marked it: the server still says uploading, this browser has
    // the record but not the file.
    patchTransfer(transfer.id, { confirmed: 20 * MB, phase: "needsFile" });
    const runtime = makeWorld([waiting]);
    const { artifact } = await captureArtifact(
      () => {
        render(() => (
          <RuntimeContext value={runtime}>
            <Board
              cancel={nothingToReport}
              clear={nothingToReport}
              deliveries={[waiting]}
              online
              select={noop}
              sendAgain={noop}
            />
            <DeliverySheet cancel={nothingToReport} close={noop} delivery={waiting} online />
          </RuntimeContext>
        ));
        flush();
      },
      { scenario: "needs-file" },
    );

    // The row offers to open the sheet, and the sheet asks for the files
    // while showing what already landed.
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    expect(screen.getByText("20 MB already uploaded.")).toBeInTheDocument();
    // The row says how much already arrived, so picking the files is worth it.
    expect(screen.getByText("1 file · 20 MB of 60 MB arrived")).toBeInTheDocument();
    expect(artifact).toHaveNoDiagnostics();
    assertBudget(artifact, { allow: [], maxReruns: 5, maxWastedRuns: 2 });
    await runtime.dispose();
  });
  it.each([
    {
      billing: freePlan,
      manage: false,
      retention: ["1:on", "3:on", "7:off", "14:off"],
      upgrade: "Upgrade to Starter · $15/mo",
      usage: "Free · 3.2 GB of 20 GB",
    },
    {
      billing: {
        cancelsAtPeriodEnd: false,
        grantEndsAt: null,
        limitBytes: 1_000_000 * MB,
        maxRetentionDays: 14,
        periodEnd: new Date("2026-11-06T00:00:00Z"),
        plan: "pro",
        status: "active",
        usedBytes: 3200 * MB,
      } satisfies BillingSummary,
      manage: true,
      retention: ["1:on", "3:on", "7:on", "14:on"],
      upgrade: "Upgrade to Studio · $69/mo",
      usage: "Pro · 3.2 GB of 1 TB",
    },
    // A code's grant is no subscription, so there is no billing to manage.
    {
      billing: betaPro,
      manage: false,
      retention: ["1:on", "3:on", "7:on", "14:on"],
      upgrade: "Upgrade to Studio · $69/mo",
      usage: "Pro · 3.2 GB of 1 TB",
    },
  ])("shows $billing.plan usage and only the retention the plan allows", async (expected) => {
    const runtime = makeWorld([], undefined, expected.billing);
    const Harness = () => {
      const state = createDeliveries(runtime);
      return (
        <>
          <TopBar
            billing={state.billing()}
            manage={noop}
            principal={{ email: "s@test", id: "s", image: null, name: "Sender" }}
            redeem={state.redeem}
            redeeming={state.redeeming()}
            send={noop}
            upgrade={noop}
          />
          <SendCard
            billing={state.billing()}
            dragging={false}
            pickFiles={noop}
            pickFolder={noop}
            problems={[]}
            retention={3}
            sending={false}
            setRetention={noop}
            upgrade={noop}
          />
        </>
      );
    };
    const { artifact } = await captureArtifact(
      () => {
        render(() => (
          <RuntimeContext value={runtime}>
            <Loading fallback={<p>loading</p>}>
              <Harness />
            </Loading>
          </RuntimeContext>
        ));
      },
      { scenario: `billing-${expected.billing.plan}` },
    );
    await screen.findByText(expected.usage);
    flush();

    // The account menu is a closed popover, so the queries include hidden nodes.
    // All four stay visible; the ones above the plan are disabled.
    expect(
      screen
        .getAllByRole("radio")
        .map(
          (radio) =>
            `${radio.getAttribute("value")}:${radio.hasAttribute("disabled") ? "off" : "on"}`,
        ),
    ).toEqual(expected.retention);
    expect(
      screen.getByRole("button", { hidden: true, name: expected.upgrade }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { hidden: true, name: "Manage billing" }) !== null).toBe(
      expected.manage,
    );
    expect(artifact).toHaveNoDiagnostics();
    await runtime.dispose();
  });
  it("an invite code redeems on landing and the plan shows until when", async () => {
    const runtime = makeWorld([]);
    const [landed, setLanded] = createSignal(false);
    let redeem: ReturnType<typeof createDeliveries>["redeem"] | undefined;
    const Harness = () => {
      const state = createDeliveries(runtime);
      ({ redeem } = state);
      return (
        <>
          <TopBar
            billing={state.billing()}
            manage={noop}
            principal={{ email: "s@test", id: "s", image: null, name: "Sender" }}
            redeem={state.redeem}
            redeeming={state.redeeming()}
            send={noop}
            upgrade={noop}
          />
          <SendCard
            billing={state.billing()}
            dragging={false}
            pickFiles={noop}
            pickFolder={noop}
            problems={[]}
            retention={3}
            sending={false}
            setRetention={noop}
            upgrade={noop}
          />
          <Show when={landed()}>
            <Landing redeem={state.redeem} />
          </Show>
        </>
      );
    };
    render(() => (
      <RuntimeContext value={runtime}>
        <Loading fallback={<p>loading</p>}>
          <Harness />
        </Loading>
      </RuntimeContext>
    ));
    await screen.findByText("Free · 3.2 GB of 20 GB");

    const { artifact } = await captureArtifact(
      async () => {
        setLanded(true);
        flush();
        await screen.findByText("Pro · 3.2 GB of 1 TB");
      },
      { scenario: "redeem-on-landing" },
    );
    flush();

    const until = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      weekday: "long",
    }).format(betaEnds);
    expect(screen.getByText(`Free with a code until ${until}`)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`^3.2 GB of 1 TB in use on Pro until ${until}`, "u")),
    ).toBeInTheDocument();
    // The Applying… flag is an optimistic write that reverts when the action
    // settles, by design; anything else is a defect.
    expect(artifact).toHaveNoDiagnostics({ allow: ["OPTIMISTIC_REVERTED"] });
    // A wrong code resolves to the words its toast shows.
    expect(await redeem?.("NOPE")).toBe(
      "We don't know that code. Check the spelling and try again.",
    );
    await runtime.dispose();
  });

  it("a row says Starting… until acknowledged parts give it a speed", async () => {
    const fresh = delivery("Fresh", "open", [500 * MB]);
    const [transfer] = fresh.transfers;
    if (transfer === undefined) {
      throw new Error("fixture needs a transfer");
    }
    // Bytes are on the wire, but R2 has acknowledged none: no speed exists yet.
    patchTransfer(transfer.id, { inFlight: 40 * MB, phase: "uploading" });
    const runtime = makeWorld([fresh]);
    render(() => (
      <RuntimeContext value={runtime}>
        <Board
          cancel={nothingToReport}
          clear={nothingToReport}
          deliveries={[fresh]}
          online
          select={noop}
          sendAgain={noop}
        />
      </RuntimeContext>
    ));
    flush();
    expect(screen.getByText("Starting…")).toBeInTheDocument();
    expect(screen.queryByText(/\/s|left/u)).toBeNull();

    const { artifact } = await captureArtifact(
      () => {
        // The first part lands; the engine now has a measured rate.
        patchTransfer(transfer.id, { bytesPerSecond: 20 * MB, confirmed: 64 * MB, inFlight: 0 });
      },
      { scenario: "first-ack" },
    );

    flush();
    expect(screen.getByText("20 MB/s · about a minute left")).toBeInTheDocument();
    expect(screen.queryByText("Starting…")).toBeNull();
    expect(artifact).toHaveNoDiagnostics();
    // A one-off change of state, not a tick: Board.groups confirms nothing
    // regrouped, and every binding that reads the row's kind re-checks once.
    assertBudget(artifact, { allow: [], maxReruns: 21, maxWastedRuns: 10 });
    await runtime.dispose();
  });

  it("an interrupted row starts over after an in-place confirm", async () => {
    // Open on the server with no record in this browser: it can't continue.
    const stuck = delivery("Stuck", "open", [80 * MB]);
    const cancel = vi.fn(nothingToReport);
    const sendAgain = vi.fn<() => void>();
    const runtime = makeWorld([stuck]);
    render(() => (
      <RuntimeContext value={runtime}>
        <Board
          cancel={cancel}
          clear={nothingToReport}
          deliveries={[stuck]}
          online
          select={noop}
          sendAgain={sendAgain}
        />
      </RuntimeContext>
    ));

    const { artifact } = await captureArtifact(
      () => {
        screen.getByRole("button", { name: "Start over" }).click();
        flush();
        screen.getByRole("button", { name: "Yes, start over" }).click();
        flush();
      },
      { scenario: "start-over" },
    );

    expect(sendAgain).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledWith(stuck.id);
    expect(artifact).toHaveNoDiagnostics();
    assertBudget(artifact, { allow: [], maxReruns: 6, maxWastedRuns: 2 });
    await runtime.dispose();
  });

  it("clearing ended deliveries takes them off the board at once", async () => {
    const server = [
      delivery("Live", "ready", [MB]),
      delivery("GoneA", "cancelled", [MB]),
      delivery("GoneB", "cancelled", [MB]),
    ];
    const runtime = makeWorld(server);
    const Harness = () => {
      const state = createDeliveries(runtime);
      return (
        <Board
          cancel={state.cancel}
          clear={state.clear}
          deliveries={state.deliveries}
          online
          select={noop}
          sendAgain={noop}
        />
      );
    };
    render(() => (
      <RuntimeContext value={runtime}>
        <Loading fallback={<p>loading</p>}>
          <Harness />
        </Loading>
      </RuntimeContext>
    ));
    await screen.findByText("Live");
    // Ended rows start folded; the heading counts them.
    const ended = screen.getByRole("button", { name: /Ended/u });
    expect(ended).toHaveTextContent("Ended 2");

    const { artifact } = await captureArtifact(
      async () => {
        ended.click();
        flush();
        // One row by its own button, then the rest at once.
        const [clearA] = screen.getAllByRole("button", { name: "Clear" });
        clearA?.click();
        flush();
        expect(ended).toHaveTextContent("Ended 1");
        await vi.waitFor(() => {
          expect(server).toHaveLength(2);
        });
        screen.getByRole("button", { name: "Clear all" }).click();
        flush();
        expect(screen.queryByRole("button", { name: /Ended/u })).toBeNull();
        await vi.waitFor(() => {
          expect(server.map((row) => row.title)).toEqual(["Live"]);
        });
      },
      { scenario: "clear-ended" },
    );

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(artifact).toHaveNoDiagnostics();
    await runtime.dispose();
  });
});

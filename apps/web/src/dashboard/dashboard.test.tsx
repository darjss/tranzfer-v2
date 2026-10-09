import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { assertBudget, captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import {
  AccessCodeRefused,
  Api,
  Authenticated,
  CurrentPrincipal,
  DeliveryId,
  TransferId,
  Unauthorized,
} from "@tranzfer/contracts";
import type { BillingSummary, Delivery, DeliveryEmail } from "@tranzfer/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as Struct from "effect/Struct";
import * as Tracer from "effect/Tracer";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as RpcTest from "effect/rpc/RpcTest";
import { createSignal, Errored, flush, Loading, onSettled, Show } from "solid-js";

import { ApiClient } from "../api/client";
import { reportFailure } from "../api/errors";
import { NotifyMe } from "../landing/Pricing";
import { RuntimeContext } from "../api/solid-effect";
import { patchTransfer } from "../uploads/store";
import { claim, letGo } from "../uploads/tabs";
import { untilDate } from "./format";
import { Uploads } from "../uploads/uploads";
import { Board } from "./Board";
import { SendCard } from "./SendCard";
import { SendDoneList } from "./SendDone";
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
  download: Delivery["download"] = null,
): Delivery => ({
  createdAt: new Date("2026-09-29T08:00:00Z"),
  download,
  expiresAt: status === "ready" ? new Date("2026-10-02T08:00:00Z") : null,
  id: DeliveryId.make(crypto.randomUUID()),
  link: `/d/${title}`,
  note: "",
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

// What the fake API holds for emails: each request, and a row per address that
// a test settles the way the real background send would.
const emailRequests: (readonly string[])[] = [];
const emailRows: DeliveryEmail[] = [];

const makeWorld = (
  server: Delivery[],
  gate?: Deferred.Deferred<boolean>,
  initialBilling: BillingSummary = freePlan,
  // How many list reads fail before the server answers, like a dropped request.
  listFailures = 0,
) => {
  // Redeeming BETA-PRO changes what the next GetBilling answers, like the real API.
  let billing = initialBilling;
  let listsToFail = listFailures;
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
          Deliveries: () =>
            Effect.suspend(() => {
              listsToFail -= 1;
              return listsToFail < 0 ? Effect.succeed([...server]) : Effect.die("list failed");
            }),
          DeliveryEmails: () => Effect.sync(() => emailRows.toReversed()),
          FinalizeTransfer: () => Effect.die("unused"),
          GetBilling: () => Effect.sync(() => billing),
          // Like the real one: without an address it needs a session, and
          // this page plays a signed-out visitor.
          JoinInterest: ({ email }) =>
            email === undefined ? Effect.fail(new Unauthorized()) : Effect.succeed({ email }),
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
          ReportDownload: () => Effect.die("unused"),
          SendDeliveryEmail: ({ recipients }) =>
            Effect.sync(() => {
              emailRequests.push(recipients);
              return recipients.map(() => {
                const row = {
                  errorCode: null,
                  id: emailRows.length + 1,
                  status: "queued" as const,
                };
                emailRows.push(row);
                return row;
              });
            }),
          SignUpload: () => Effect.die("unused"),
          StartCheckout: () => Effect.die("unused"),
          UpdateDelivery: ({ deliveryId, note, title }) =>
            Effect.gen(function* fakeUpdate() {
              const index = server.findIndex((row) => row.id === deliveryId);
              const row = server[index];
              if (row === undefined) {
                return yield* Effect.die(new Error("unknown delivery"));
              }
              const updated = Struct.evolve(row, { note: () => note, title: () => title });
              server[index] = updated;
              return updated;
            }),
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
      // Reports some of the stored bytes checked, then holds like cancel does.
      resume: (_delivery, _files, onChecking) =>
        Effect.gen(function* fakeResume() {
          onChecking?.({ checked: 12 * MB, total: 50 * MB });
          if (gate !== undefined) {
            yield* Deferred.await(gate);
          }
          return [];
        }),
      retry: () => Effect.die("unused"),
      // The server has the delivery, open, with one transfer per file.
      send: (chosen) =>
        Effect.sync(() => {
          const created = delivery(
            "Episode 14",
            "open",
            chosen.map(({ file }) => file.size),
          );
          server.unshift(created);
          return created;
        }),
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

  it("a ready row says how far its download got, and claims nothing more", async () => {
    const at = new Date(Date.now() - 60_000);
    const withDownload = (title: string, filesSaved: number) =>
      delivery(title, "ready", [MB, MB, MB], { filesSaved, lastAt: at, startedAt: at });
    const rows = [
      delivery("Fresh", "ready", [MB]),
      withDownload("Started", 0),
      withDownload("Partway", 2),
      withDownload("Whole", 3),
    ];
    const runtime = makeWorld(rows);
    render(() => (
      <RuntimeContext value={runtime}>
        <Board
          cancel={nothingToReport}
          clear={nothingToReport}
          deliveries={rows}
          online
          select={noop}
          sendAgain={noop}
        />
      </RuntimeContext>
    ));
    flush();
    expect(screen.getByText("Not downloaded yet")).toBeInTheDocument();
    expect(screen.getByText(/^Download started /u)).toBeInTheDocument();
    expect(screen.getByText(/^2 of 3 files downloaded, last /u)).toBeInTheDocument();
    expect(screen.getByText("Downloaded, 3 of 3 files")).toBeInTheDocument();
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
  it("a re-pick shows how much of the stored data is checked, then lets go", async () => {
    const waiting = delivery("Checking", "open", [60 * MB]);
    const [transfer] = waiting.transfers;
    if (transfer === undefined) {
      throw new Error("fixture needs a transfer");
    }
    patchTransfer(transfer.id, { confirmed: 20 * MB, phase: "needsFile" });
    const gate = Deferred.makeUnsafe<boolean>();
    const runtime = makeWorld([waiting], gate);
    const { artifact } = await captureArtifact(
      async () => {
        render(() => (
          <RuntimeContext value={runtime}>
            <DeliverySheet cancel={nothingToReport} close={noop} delivery={waiting} online />
          </RuntimeContext>
        ));
        flush();

        const picker = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (picker === null) {
          throw new Error("the sheet has no file input");
        }
        fireEvent.change(picker, { target: { files: [new File(["x"], "0.bin")] } });
        expect(
          await screen.findByText("Checking 12 MB of 50 MB you already sent"),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();

        Deferred.doneUnsafe(gate, Effect.succeed(true));
        await vi.waitFor(() => {
          expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
        });
        expect(screen.queryByText(/you already sent/u)).not.toBeInTheDocument();
      },
      { scenario: "re-pick-check" },
    );
    expect(artifact).toHaveNoDiagnostics();
    assertBudget(artifact, { allow: [], maxReruns: 20, maxWastedRuns: 5 });
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

  it("a signed-out visitor joins a closed plan's list from its card", async () => {
    const runtime = makeWorld([]);
    // What each paid pricing card shows while paid plans are closed.
    render(() => (
      <RuntimeContext value={runtime}>
        <NotifyMe hot plan="pro" />
        <NotifyMe hot={false} plan="studio" />
      </RuntimeContext>
    ));
    const [pro] = screen.getAllByRole("button", { name: "Tell me when it opens" });

    const { artifact } = await captureArtifact(
      async () => {
        pro?.click();
        const input = await screen.findByRole("textbox", { name: "Your email" });
        expect(screen.getByText("We'll email you once, the day Pro opens.")).toBeInTheDocument();
        if (!(input instanceof HTMLInputElement)) {
          throw new Error("expected the email input");
        }
        input.value = "ana@example.com";
        screen.getByRole("button", { name: "Notify me" }).click();
        await screen.findByRole("status");
      },
      { scenario: "interest-signup" },
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're on the list. We'll email ana@example.com once, the day Pro opens.",
    );
    // The other card is untouched.
    expect(screen.getAllByRole("button", { name: "Tell me when it opens" })).toHaveLength(1);
    // The pending flag is an optimistic true that each of the two calls ends.
    expect(artifact).toHaveNoDiagnostics({ allow: ["OPTIMISTIC_REVERTED"] });
    // Two calls, two state changes (button to form, form to the note) and the
    // pending flag on each; nothing recomputes without changing.
    assertBudget(artifact, { allow: ["OPTIMISTIC_REVERTED"], maxReruns: 15, maxWastedRuns: 0 });
    await runtime.dispose();
  });

  it("a sent delivery gets its finished card when the server says ready, and never again", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const writeText = vi.fn(async () => {
      await Promise.resolve();
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const server: Delivery[] = [];
    const runtime = makeWorld(server);
    let state: ReturnType<typeof createDeliveries> | undefined;
    const Harness = () => {
      state = createDeliveries(runtime);
      return (
        <>
          <SendDoneList
            deliveries={state.deliveries}
            dismiss={state.dismiss}
            email={state.email}
            emailed={state.emailed}
            emailing={state.emailing()}
            finished={state.finished()}
            update={state.update}
          />
          <Board
            cancel={state.cancel}
            clear={state.clear}
            deliveries={state.deliveries}
            online
            select={noop}
            sendAgain={noop}
          />
        </>
      );
    };
    const mount = () => {
      render(() => (
        <RuntimeContext value={runtime}>
          <Loading fallback={<p>loading</p>}>
            <Harness />
          </Loading>
        </RuntimeContext>
      ));
    };
    mount();
    await vi.waitFor(() => {
      expect(screen.queryByText("loading")).toBeNull();
    });

    // 5 MB goes up while the server still says open: every byte is sent, but
    // finalize hasn't answered, so there is no card yet.
    await state?.send(
      [{ file: new File([new Uint8Array(5 * MB)], "cut.mov"), path: "cut.mov" }],
      3,
    );
    flush();
    const [transfer] = server[0]?.transfers ?? [];
    if (transfer === undefined) {
      throw new Error("the fake send makes one transfer");
    }
    patchTransfer(transfer.id, { confirmed: 5 * MB, phase: "finalizing", uploaded: true });
    flush();
    expect(screen.queryByText("Your files are ready")).toBeNull();

    // Four minutes twelve later finalize lands: the server flips to ready and
    // this tab's transfer reads done.
    clock.mockReturnValue(1_000_000 + 252_000);
    const readyAt = new Date("2026-10-23T09:00:00Z");
    const { artifact } = await captureArtifact(
      async () => {
        const [open] = server;
        if (open === undefined) {
          throw new Error("the fake send added the delivery");
        }
        server[0] = Struct.evolve(open, {
          expiresAt: () => readyAt,
          status: () => "ready" as const,
          transfers: (rows) =>
            rows.map((row) => Struct.evolve(row, { state: () => "complete" as const })),
        });
        patchTransfer(transfer.id, { phase: "done" });
        await screen.findByText("Your files are ready");
      },
      { scenario: "send-finished" },
    );
    flush();

    const link = `${location.origin}/d/Episode 14`;
    const card = within(screen.getByRole("region", { name: "Your files are ready" }));
    expect(card.getByText("Episode 14")).toBeInTheDocument();
    expect(card.getByText("1 file · 5 MB")).toBeInTheDocument();
    expect(card.getByText("took 4 min 12 s")).toBeInTheDocument();
    expect(card.getByText(`link works until ${untilDate(readyAt)}`)).toBeInTheDocument();
    const open = card.getByRole("link", { name: /Open recipient page/u });
    expect(open).toHaveAttribute("href", "/d/Episode 14");
    expect(open).toHaveAttribute("target", "_blank");
    card.getByRole("button", { name: "Copy link" }).click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith(link);
    });
    card.getByRole("button", { name: "Copy message" }).click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenLastCalledWith(
        `Episode 14 is ready: ${link} Download before ${untilDate(readyAt)}.`,
      );
    });
    expect(artifact).toHaveNoDiagnostics({ allow: ["OPTIMISTIC_REVERTED"] });
    // One state change on a whole list: the row leaves Moving for Ready, the
    // new card mounts and the copy buttons settle. Nothing recomputes for
    // nothing. The re-read's optimistic overlay reverts by design.
    assertBudget(artifact, { allow: ["OPTIMISTIC_REVERTED"], maxReruns: 55, maxWastedRuns: 0 });

    // The sender renames it and adds a note. Markup in the note stays text.
    screen.getByRole("button", { name: "Rename or add a note" }).click();
    flush();
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "  Episode 14, final  " },
    });
    fireEvent.input(screen.getByRole("textbox", { name: /Note for the recipient/u }), {
      target: { value: "Colour is locked.\n<b>Use the LUT</b>" },
    });
    flush();
    screen.getByRole("button", { name: "Save" }).click();
    await vi.waitFor(() => {
      expect(server[0]).toMatchObject({
        note: "Colour is locked.\n<b>Use the LUT</b>",
        title: "Episode 14, final",
      });
    });
    const note = await screen.findByText(/Use the LUT/u);
    expect(note.textContent).toBe("Colour is locked.\n<b>Use the LUT</b>");
    expect(note.querySelector("b")).toBeNull();

    // Dismissing settles it into its Ready row.
    screen.getByRole("button", { name: "Dismiss" }).click();
    flush();
    expect(screen.queryByText("Your files are ready")).toBeNull();
    expect(readyCount()).toContain("1");

    // A reload starts empty: the delivery is ready, but this page didn't send it.
    cleanup();
    mount();
    await screen.findByText("Episode 14, final");
    expect(screen.queryByText("Your files are ready")).toBeNull();
    clock.mockRestore();
    await runtime.dispose();
  });

  it("the finished card emails the link and says only what the mail server reported", async () => {
    emailRequests.length = 0;
    emailRows.length = 0;
    const server: Delivery[] = [];
    const runtime = makeWorld(server);
    let state: ReturnType<typeof createDeliveries> | undefined;
    const Harness = () => {
      state = createDeliveries(runtime);
      return (
        <SendDoneList
          deliveries={state.deliveries}
          dismiss={state.dismiss}
          email={state.email}
          emailed={state.emailed}
          emailing={state.emailing()}
          finished={state.finished()}
          update={state.update}
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
    await vi.waitFor(() => {
      expect(screen.queryByText("loading")).toBeNull();
    });
    await state?.send(
      [{ file: new File([new Uint8Array(5 * MB)], "cut.mov"), path: "cut.mov" }],
      3,
    );
    flush();
    const [open] = server;
    const [transfer] = open?.transfers ?? [];
    if (open === undefined || transfer === undefined) {
      throw new Error("the fake send makes one transfer");
    }
    patchTransfer(transfer.id, { confirmed: 5 * MB, phase: "finalizing", uploaded: true });
    server[0] = Struct.evolve(open, {
      expiresAt: () => new Date("2026-10-23T09:00:00Z"),
      status: () => "ready" as const,
      transfers: (rows) =>
        rows.map((row) => Struct.evolve(row, { state: () => "complete" as const })),
    });
    patchTransfer(transfer.id, { phase: "done" });
    await screen.findByText("Your files are ready");

    const { artifact } = await captureArtifact(
      async () => {
        screen.getByRole("button", { name: "Email it" }).click();
        flush();
        // A bad address stops at the form; nothing is sent.
        fireEvent.input(screen.getByRole("textbox", { name: /Email addresses/u }), {
          target: { value: "ann@example.com, nope" },
        });
        flush();
        screen.getByRole("button", { name: "Send email" }).click();
        await screen.findByText('"nope" doesn\'t look like an email address.');
        expect(emailRequests).toEqual([]);

        // Case and repeats don't make a second email.
        fireEvent.input(screen.getByRole("textbox", { name: /Email addresses/u }), {
          target: { value: "Ann@Example.com, bob@example.com\nann@example.com" },
        });
        flush();
        screen.getByRole("button", { name: "Send email" }).click();
        await screen.findByText("bob@example.com");
        expect(emailRequests).toEqual([["ann@example.com", "bob@example.com"]]);
        expect(screen.getAllByText("Sending")).toHaveLength(3);

        // The background send ends: one went out, one bounced before.
        emailRows.splice(
          0,
          2,
          { errorCode: null, id: 1, status: "sent" },
          { errorCode: "E_RECIPIENT_SUPPRESSED", id: 2, status: "failed" },
        );
        await screen.findByText("Sent to 1 of 2, one address bounced", {}, { timeout: 5000 });
      },
      { scenario: "email-it" },
    );
    flush();

    const card = within(screen.getByRole("region", { name: "Your files are ready" }));
    expect(card.getByText("Sent")).toBeInTheDocument();
    expect(card.getByText("Not sent, this address bounced before")).toBeInTheDocument();
    expect(card.getByText(/We can't see anyone's inbox/u)).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Email it to more people" })).toBeInTheDocument();
    expect(artifact).toHaveNoDiagnostics({ allow: ["OPTIMISTIC_REVERTED"] });
    assertBudget(artifact, { allow: ["OPTIMISTIC_REVERTED"], maxReruns: 45, maxWastedRuns: 0 });
    await runtime.dispose();
  });

  it("Try again re-reads a list that failed to load and the board comes back", async () => {
    const server = [delivery("Live", "ready", [MB])];
    // The first read of the list fails, which is what the user sees on a dropped request.
    const runtime = makeWorld(server, undefined, freePlan, 1);
    const Harness = () => {
      const state = createDeliveries(runtime);
      return (
        <Errored
          fallback={(_error, retry) => (
            <button onClick={retry} type="button">
              Try again
            </button>
          )}
        >
          <Board
            cancel={state.cancel}
            clear={state.clear}
            deliveries={state.deliveries}
            online
            select={noop}
            sendAgain={noop}
          />
        </Errored>
      );
    };
    render(() => (
      <RuntimeContext value={runtime}>
        <Loading fallback={<p>loading</p>}>
          <Harness />
        </Loading>
      </RuntimeContext>
    ));
    const tryAgain = await screen.findByRole("button", { name: "Try again" });

    const { artifact } = await captureArtifact(
      async () => {
        tryAgain.click();
        await screen.findByText("Live");
      },
      { scenario: "try-again" },
    );

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(artifact).toHaveNoDiagnostics();
    await runtime.dispose();
  });

  it.effect("the boundary report keeps the real error and drops URLs and query strings", () =>
    Effect.gen(function* reportsTheError() {
      const attributes: Map<string, unknown>[] = [];
      const tracer = Tracer.make({
        span: (options) =>
          new (class extends Tracer.NativeSpan {
            override end(...args: Parameters<Tracer.NativeSpan["end"]>) {
              super.end(...args);
              attributes.push(this.attributes);
            }
          })(options),
      });
      const failure = new TypeError("could not read https://tranzfer.app/rpc?code=SECRET twice");
      yield* reportFailure(failure, ["DeliveriesPage", "Board"]).pipe(Effect.withTracer(tracer));

      const [reported] = attributes;
      expect(reported?.get("error.type")).toBe("TypeError");
      expect(reported?.get("error.message")).toBe("could not read /rpc twice");
      expect(reported?.get("owner.path")).toBe("DeliveriesPage > Board");
      expect(String(reported?.get("error.stack"))).not.toMatch(/SECRET|https:/u);
    }),
  );

  it("a file another tab is sending says so, and the list re-reads when that tab lets go", async () => {
    // jsdom has no Web Locks. This runs each name's requests one after another.
    const tails = new Map<string, Promise<unknown>>();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (name: string, ...args: [() => Promise<void>] | [object, () => boolean]) => {
          const run = args.length === 1 ? args[0] : args[1];
          const before = tails.get(name) ?? Promise.resolve();
          const mine = (async () => {
            await before;
            return await run();
          })();
          tails.set(name, mine);
          return await mine;
        },
      },
    });
    const shared = delivery("Shared", "open", [60 * MB]);
    const [transfer] = shared.transfers;
    if (transfer === undefined) {
      throw new Error("fixture needs a transfer");
    }
    // The other tab holds the lock; this tab's restore marked the transfer.
    claim(transfer.id);
    patchTransfer(transfer.id, { confirmed: 20 * MB, phase: "elsewhere" });
    const server = [shared];
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
    await screen.findByText("Shared");
    expect(screen.getByText("Sending in another tab")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();

    const { artifact } = await captureArtifact(
      async () => {
        // The other tab finishes: the server says ready, then its lock is freed.
        server[0] = Struct.evolve(shared, {
          expiresAt: () => new Date("2026-10-02T08:00:00Z"),
          status: () => "ready" as const,
          transfers: (rows) =>
            rows.map((row) => Struct.evolve(row, { state: () => "complete" as const })),
        });
        letGo(transfer.id);
        await screen.findByRole("heading", { name: /Ready to share/u });
      },
      { scenario: "other-tab-finishes" },
    );

    expect(screen.queryByText("Sending in another tab")).toBeNull();
    expect(artifact).toHaveNoDiagnostics();
    await runtime.dispose();
  });
});

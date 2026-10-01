import { afterEach, describe, expect, it } from "@effect/vitest";
import { assertBudget, captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { Api, Authenticated, CurrentPrincipal, DeliveryId, TransferId } from "@tranzfer/contracts";
import type { Delivery } from "@tranzfer/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as Struct from "effect/Struct";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as RpcTest from "effect/unstable/rpc/RpcTest";
import { flush, Loading } from "solid-js";

import { ApiClient } from "../api/client";
import { RuntimeContext } from "../api/solid-effect";
import { patchTransfer } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import { Board } from "./Board";
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
const makeWorld = (server: Delivery[], gate?: Deferred.Deferred<boolean>) => {
  const api = Layer.effect(ApiClient, RpcTest.makeClient(Api)).pipe(
    Layer.provide(
      Api.toLayer(
        Api.of({
          CancelDelivery: () => Effect.die("unused"),
          CreateDelivery: () => Effect.die("unused"),
          Deliveries: () => Effect.sync(() => [...server]),
          FinalizeTransfer: () => Effect.die("unused"),
          Me: () => Effect.service(CurrentPrincipal),
          OpenLink: () => Effect.die("unused"),
          SignUpload: () => Effect.die("unused"),
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
          const cancelled = Struct.evolve(row, { status: () => "cancelled" as const });
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
    expect(artifact).toHaveNoDiagnostics();
    assertBudget(artifact, { allow: [], maxReruns: 5, maxWastedRuns: 2 });
    await runtime.dispose();
  });
});

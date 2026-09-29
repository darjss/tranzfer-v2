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

  it("a progress tick recomputes only the moving row and the grouping check", async () => {
    const moving = delivery("Moving", "open", [200 * MB, 100 * MB]);
    const ready = [delivery("ReadyA", "ready", [5 * MB]), delivery("ReadyB", "ready", [7 * MB])];
    const [first] = moving.transfers;
    if (first === undefined) {
      throw new Error("fixture has no transfer");
    }
    patchTransfer(first.id, { confirmed: 10 * MB, phase: "uploading" });
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

    expect(artifact).toHaveNoDiagnostics();
    // One tick recomputes the moving row's rollup (the real change), and the
    // two memos that confirm nothing moved: the row's kind and the board's
    // grouping. Nothing else on the board runs.
    assertBudget(artifact, { allow: [], maxReruns: 3, maxWastedRuns: 2 });
    expect((artifact.attribution?.reruns ?? []).map((run) => run.nodeName).toSorted()).toEqual([
      "Board.groups",
      "Row.kind",
      "Row.roll",
    ]);
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
});

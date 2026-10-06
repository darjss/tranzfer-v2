import type { Delivery, DeliveryId, RetentionDays } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import * as Struct from "effect/Struct";
import {
  action,
  createEffect,
  createMemo,
  createOptimistic,
  createOptimisticStore,
  refresh,
} from "solid-js";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { runEffect } from "../api/solid-effect";
import type { AppServices } from "../api/solid-effect";
import { transfers } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import type { ChosenFile } from "../uploads/uploads";
import { kindOf, rollup, totalSize } from "./format";

// What a cancel looks like before the server confirms it.
const cancelled = (delivery: Delivery): Delivery =>
  Struct.evolve(delivery, {
    status: () => "cancelled" as const,
    transfers: (rows) =>
      rows.map((transfer) => Struct.evolve(transfer, { state: () => "cancelled" as const })),
  });

/**
 * The sender's deliveries and the actions that change them. Each action
 * resolves to a problem to show, or undefined when it went through.
 */
export const createDeliveries = (runtime: ManagedRuntime.ManagedRuntime<AppServices, never>) => {
  // The server list, overlaid by the actions below: a sent delivery shows up
  // and a cancelled one moves to Ended the moment it happens, then the
  // re-read reconciles.
  const [deliveries, setDeliveries] = createOptimisticStore<Delivery[]>(
    () =>
      runEffect(
        ApiClient.use((api) =>
          api.Deliveries().pipe(
            // Every read rebuilds what this tab can still recover.
            Effect.tap((list) => Uploads.use((uploads) => uploads.restore(list))),
            Effect.map((list) => [...list]),
          ),
        ),
      ),
    [],
    { key: "id" },
  );
  // A transfer finishing locally changes its delivery on the server.
  createEffect(
    () => Object.values(transfers).filter((progress) => progress.phase === "done").length,
    (done, before) => {
      if (before !== undefined && done > before) {
        void refresh(deliveries);
      }
    },
  );
  // A server-side finalizing transfer settles on its own (this tab's lost
  // Complete, or the sweeper); poll until none are left so it lands as done.
  createEffect(
    () =>
      deliveries.some((delivery) =>
        delivery.transfers.some((transfer) => transfer.state === "finalizing"),
      ),
    (stuck) => {
      const timer = stuck
        ? setInterval(() => {
            void refresh(deliveries);
          }, 10_000)
        : undefined;
      return () => {
        clearInterval(timer);
      };
    },
  );
  const [sending, setSending] = createOptimistic(false);

  const send = action(async function* send(chosen: readonly ChosenFile[], days: RetentionDays) {
    setSending(true);
    const exit = await runtime.runPromiseExit(Uploads.use((uploads) => uploads.send(chosen, days)));
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (Exit.isSuccess(exit)) {
      const created = exit.value;
      setDeliveries((list) => {
        list.unshift(created);
      });
      void refresh(deliveries);
    }
    return failure;
  });

  /** Resolves to a problem to show, or undefined once the delivery is cancelled. */
  const cancel = action(async function* cancel(deliveryId: DeliveryId) {
    setDeliveries((list) => {
      const index = list.findIndex((delivery) => delivery.id === deliveryId);
      const row = list[index];
      if (row !== undefined) {
        list[index] = cancelled(row);
      }
    });
    const exit = await runtime.runPromiseExit(Uploads.use((uploads) => uploads.cancel(deliveryId)));
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (failure === undefined) {
      void refresh(deliveries);
    }
    return failure;
  });

  return { cancel, deliveries, send, sending };
};

/** A delivery's live state: server status plus whatever this tab is uploading. */
export const liveDelivery = (source: { readonly delivery: Delivery; readonly online: boolean }) => {
  const roll = createMemo(() => rollup(source.delivery, (id) => transfers[id]), {
    name: "Row.roll",
  });
  const kind = createMemo(() => kindOf(source.delivery.status, roll(), source.online), {
    name: "Row.kind",
  });
  const total = createMemo(() => totalSize(source.delivery), { name: "Row.total" });
  return { kind, roll, total };
};

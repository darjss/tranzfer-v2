import { plans } from "@tranzfer/contracts";
import type { Delivery, DeliveryId, RetentionDays } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as ManagedRuntime from "effect/ManagedRuntime";
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
import { bytes, kindOf, rollup, totalSize, untilDate } from "./format";

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
  // Space in use changes whenever a delivery is made or cancelled, so the
  // plan summary is read and refreshed beside the list.
  const billing = createMemo(() => runEffect(ApiClient.use((api) => api.GetBilling())), {
    name: "Billing.summary",
  });
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
    void refresh(billing);
    return failure;
  });

  /** Resolves to a problem to show, or undefined once the delivery is cancelled. */
  const cancel = action(async function* cancel(deliveryId: DeliveryId) {
    setDeliveries((list) => {
      // Write the fields a cancel changes, not a whole new row, so the
      // server's answer settles to the same values instead of replacing them.
      // Object.assign because the contract types are readonly.
      const row = list.find((delivery) => delivery.id === deliveryId);
      if (row !== undefined) {
        Object.assign(row, { status: "cancelled" });
        for (const transfer of row.transfers) {
          Object.assign(transfer, { state: "cancelled" });
        }
      }
    });
    const exit = await runtime.runPromiseExit(Uploads.use((uploads) => uploads.cancel(deliveryId)));
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (failure === undefined) {
      void refresh(deliveries);
      void refresh(billing);
      const { toaster } = await import("../ui/Toasts");
      toaster.success({
        description: "The link stopped working and the files are being deleted.",
        title: "Delivery cancelled",
      });
    }
    return failure;
  });

  /** Takes ended deliveries off the list at once; resolves to a problem to show, if any. */
  const clear = action(async function* clear(deliveryIds: readonly DeliveryId[]) {
    setDeliveries((list) => list.filter((delivery) => !deliveryIds.includes(delivery.id)));
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.ClearDeliveries({ deliveryIds })),
    );
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (failure === undefined) {
      void refresh(deliveries);
      const { toaster } = await import("../ui/Toasts");
      toaster.success({
        title:
          deliveryIds.length === 1
            ? "Cleared 1 delivery"
            : `Cleared ${deliveryIds.length} deliveries`,
      });
    }
    return failure;
  });

  const [redeeming, setRedeeming] = createOptimistic(false);

  /** Applies an access code and says what it gave; resolves to a problem, if any. */
  const redeem = action(async function* redeem(code: string) {
    setRedeeming(true);
    const exit = await runtime.runPromiseExit(ApiClient.use((api) => api.RedeemCode({ code })));
    yield;
    const problem = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    const { toaster } = await import("../ui/Toasts");
    if (Exit.isSuccess(exit)) {
      void refresh(billing);
      const { endsAt, plan } = exit.value;
      toaster.success({
        description: `${bytes(plans[plan].activeBytes)} at once, links up to ${plans[plan].maxRetentionDays} days.`,
        title: `You're on ${plans[plan].name} until ${untilDate(endsAt)}`,
      });
    } else {
      toaster.error({ description: problem, title: "That code didn't work" });
    }
    return problem;
  });

  return { billing, cancel, clear, deliveries, redeem, redeeming, send, sending };
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

import { DeliveryId, plans } from "@tranzfer/contracts";
import type { Delivery, RetentionDays } from "@tranzfer/contracts";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import {
  action,
  createEffect,
  createMemo,
  createOptimistic,
  createOptimisticStore,
  createSignal,
  createStore,
  refresh,
} from "solid-js";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { runEffect } from "../api/solid-effect";
import type { AppServices } from "../api/solid-effect";
import { transfers } from "../uploads/store";
import { untilFree } from "../uploads/tabs";
import { retryTransport, Uploads } from "../uploads/uploads";
import type { ChosenFile } from "../uploads/uploads";
import { bytes, emailSummary, kindOf, rollup, totalSize, untilDate } from "./format";
import type { Emailed } from "./format";

// Deliveries this page load sent, with when each send began. A delivery that
// finishes while it is listed here gets its finished card once. Module state,
// like the uploads, so leaving the page mid-upload doesn't lose it; a reload
// starts empty, so nothing replays.
const sent = new Map<DeliveryId, number>();

/** A delivery's finished card: how long the send took, in milliseconds. */
export interface Finished {
  readonly id: DeliveryId;
  readonly tookMs: number;
}

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
          // A dropped read right after a big upload used to swap the whole
          // page for the error card; transport failures retry first.
          retryTransport(api.Deliveries()).pipe(
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
  // A transfer another tab is sending ends when that tab lets go of its lock,
  // finished or closed. Read the list again then. The key is the joined ids so
  // the effect restarts only when the set changes, not on every phase write.
  createEffect(
    () =>
      Object.entries(transfers)
        .filter(([, progress]) => progress.phase === "elsewhere")
        .map(([transferId]) => transferId)
        .join(","),
    (ids) => {
      const abort = new AbortController();
      const readWhenFree = async (transferId: string) => {
        if (await untilFree(transferId, abort.signal)) {
          void refresh(deliveries);
        }
      };
      for (const transferId of ids === "" ? [] : ids.split(",")) {
        void readWhenFree(transferId);
      }
      return () => {
        abort.abort();
      };
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
  // The server flips a delivery to ready only after every file has finalized,
  // so this is the finished moment, not progress reaching 100%.
  const [finished, setFinished] = createSignal<readonly Finished[]>([]);
  createEffect(
    () =>
      deliveries
        .filter((delivery) => delivery.status === "ready" && sent.has(delivery.id))
        .map((delivery) => delivery.id),
    (ready) => {
      const now = Date.now();
      const done = ready.flatMap((id) => {
        const began = sent.get(id);
        sent.delete(id);
        return began === undefined ? [] : [{ id, tookMs: now - began }];
      });
      if (done.length > 0) {
        setFinished((list) => [...done, ...list]);
      }
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
    const began = Date.now();
    const exit = await runtime.runPromiseExit(Uploads.use((uploads) => uploads.send(chosen, days)));
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (Exit.isSuccess(exit)) {
      const created = exit.value;
      sent.set(created.id, began);
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

  const dismiss = (deliveryId: DeliveryId) => {
    setFinished((list) => list.filter((done) => done.id !== deliveryId));
  };

  /** Resolves to a problem to show, or undefined once the title and note are saved. */
  const update = action(async function* update(
    deliveryId: DeliveryId,
    details: { readonly note: string; readonly title: string },
  ) {
    setDeliveries((list) => {
      // Object.assign because the contract types are readonly.
      const row = list.find((delivery) => delivery.id === deliveryId);
      if (row !== undefined) {
        Object.assign(row, details);
      }
    });
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.UpdateDelivery({ deliveryId, ...details })),
    );
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    void refresh(deliveries);
    return failure;
  });

  /** Resolves to a problem to show, or undefined once the password is set (or removed with null). */
  const setPassword = action(async function* setPassword(
    deliveryId: DeliveryId,
    password: string | null,
  ) {
    setDeliveries((list) => {
      // Object.assign because the contract types are readonly.
      const row = list.find((delivery) => delivery.id === deliveryId);
      if (row !== undefined) {
        Object.assign(row, { hasPassword: password !== null });
      }
    });
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.SetLinkPassword({ deliveryId, password })),
    );
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    await refresh(deliveries);
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

  // Emails this page asked for, by delivery. The server keeps no address, so
  // each row carries the one typed here.
  const [emailed, setEmailed] = createStore<Record<string, Emailed[]>>({});
  const [emailing, setEmailing] = createOptimistic(false);

  /** Emails the link to each distinct address; resolves to a problem to show, or undefined once queued. */
  const email = action(async function* email(
    deliveryId: DeliveryId,
    recipients: readonly string[],
  ) {
    setEmailing(true);
    const distinct = Arr.dedupe(recipients.map((to) => to.trim().toLowerCase()));
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.SendDeliveryEmail({ deliveryId, recipients: distinct })),
    );
    yield;
    if (Exit.isSuccess(exit)) {
      const rows = Arr.zipWith(exit.value, distinct, (row, to) => ({ ...row, to }));
      setEmailed((all) => {
        all[deliveryId] = [...rows, ...(all[deliveryId] ?? [])];
      });
    }
    return Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
  });

  // The mail goes out after the server answers, so read how each ended until
  // none of this page's emails is still queued.
  const readEmails = async (deliveryId: string) => {
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.DeliveryEmails({ deliveryId: DeliveryId.make(deliveryId) })),
    );
    if (Exit.isFailure(exit)) {
      return;
    }
    const emailsDone: Emailed[][] = [];
    setEmailed((all) => {
      const rows = all[deliveryId] ?? [];
      const waiting = rows.some((row) => row.status === "queued");
      for (const row of rows) {
        const fresh = exit.value.find((candidate) => candidate.id === row.id);
        if (fresh !== undefined) {
          Object.assign(row, { errorCode: fresh.errorCode, status: fresh.status });
        }
      }
      if (waiting && !rows.some((row) => row.status === "queued")) {
        emailsDone.push(rows.map((row) => ({ ...row })));
      }
    });
    const [rows] = emailsDone;
    if (rows !== undefined) {
      const { toaster } = await import("../ui/Toasts");
      const toast = {
        description: "The mail server took them. We can't see inboxes.",
        title: emailSummary(rows),
      };
      if (rows.every((row) => row.status === "sent")) {
        toaster.success(toast);
      } else {
        toaster.warning(toast);
      }
    }
  };
  createEffect(
    () =>
      Object.entries(emailed)
        .filter(([, rows]) => rows.some((row) => row.status === "queued"))
        .map(([deliveryId]) => deliveryId)
        .join(","),
    (waiting) => {
      const timer =
        waiting === ""
          ? undefined
          : setInterval(() => {
              for (const deliveryId of waiting.split(",")) {
                void readEmails(deliveryId);
              }
            }, 2000);
      return () => {
        clearInterval(timer);
      };
    },
  );

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

  return {
    billing,
    cancel,
    clear,
    deliveries,
    dismiss,
    email,
    emailed,
    emailing,
    finished,
    redeem,
    redeeming,
    send,
    sending,
    setPassword,
    update,
  };
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

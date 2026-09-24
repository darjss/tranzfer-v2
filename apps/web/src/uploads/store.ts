import { createRoot, createSignal, createStore, runWithOwner } from "solid-js";

// Module state, not component state, so uploads survive navigation (law 11).
export type TransferPhase = "queued" | "uploading" | "finalizing" | "done" | "failed";

export interface TransferProgress {
  readonly bytesPerSecond: number;
  readonly confirmed: number;
  readonly error: string | undefined;
  readonly inFlight: number;
  readonly phase: TransferPhase;
}

const empty = (): TransferProgress => ({
  bytesPerSecond: 0,
  confirmed: 0,
  error: undefined,
  inFlight: 0,
  phase: "queued",
});

export const [transfers, setTransfersRaw] = createRoot(() =>
  createStore<Record<string, TransferProgress>>({}),
);

// Store setters have no ownedWrite escape: writes must run with no owner,
// so Uppy callbacks drop whatever scope fired them.
export const patchTransfer = (transferId: string, patch: Partial<TransferProgress>) => {
  runWithOwner(null, () => {
    setTransfersRaw((current) => {
      const previous = current[transferId] ?? empty();
      current[transferId] = { ...previous, ...patch };
    });
  });
};

export const isActive = (progress: TransferProgress | undefined) =>
  progress !== undefined &&
  (progress.phase === "queued" ||
    progress.phase === "uploading" ||
    progress.phase === "finalizing");

// Uppy callbacks write this from arbitrary scopes.
export const [deliveriesVersion, bumpDeliveries] = createRoot(() =>
  createSignal(0, { ownedWrite: true }),
);

export const [online, setOnline] = createRoot(() => createSignal(true, { ownedWrite: true }));

let wired = false;

export const wireWindow = () => {
  if (wired) {
    return;
  }
  wired = true;
  setOnline(navigator.onLine);
  window.addEventListener("online", () => {
    setOnline(true);
  });
  window.addEventListener("offline", () => {
    setOnline(false);
  });
  window.addEventListener("beforeunload", (event) => {
    if (Object.values(transfers).some((progress) => isActive(progress))) {
      event.preventDefault();
    }
  });
};

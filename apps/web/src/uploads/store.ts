import { createRoot, createSignal, createStore, runWithOwner } from "solid-js";

// Module state, not component state, so uploads survive navigation (law 11).
export type TransferPhase = "queued" | "uploading" | "finalizing" | "done" | "failed" | "cancelled";

export interface TransferProgress {
  readonly bytesPerSecond: number;
  readonly confirmed: number;
  /** What stopped a failed transfer; the UI turns it into words with appError. */
  readonly error: unknown;
  readonly inFlight: number;
  readonly phase: TransferPhase;
  /** Uppy finished the upload, so the object exists and only finalize is left. */
  readonly uploaded: boolean;
}

const empty = (): TransferProgress => ({
  bytesPerSecond: 0,
  confirmed: 0,
  error: undefined,
  inFlight: 0,
  phase: "queued",
  uploaded: false,
});

export const [transfers, setTransfersRaw] = createRoot(() =>
  createStore<Record<string, TransferProgress>>({}),
);

// Store setters have no ownedWrite escape: writes must run with no owner,
// so Uppy callbacks drop whatever scope fired them.
export const patchTransfer = (transferId: string, patch: Partial<TransferProgress>) => {
  runWithOwner(null, () => {
    setTransfersRaw((current) => {
      // Mutate the record's own keys: a fresh object would re-run every reader
      // of the record when a tick changes one field.
      current[transferId] ??= empty();
      Object.assign(current[transferId], patch);
    });
  });
};

export const isActive = (progress: TransferProgress | undefined) =>
  progress !== undefined &&
  (progress.phase === "queued" ||
    progress.phase === "uploading" ||
    progress.phase === "finalizing");

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

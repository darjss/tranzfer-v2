import type { Delivery } from "@tranzfer/contracts";

import type { TransferProgress } from "../uploads/store";

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export const bytes = (size: number) => {
  let unit = 0;
  let value = size;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${
    UNITS[unit]
  }`;
};

export const items = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

const sentFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

export const sentAt = (date: Date) => sentFormat.format(date);

const untilFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  weekday: "long",
});

export const untilDate = (date: Date) => untilFormat.format(date);

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export const shortDateAt = (date: Date) => shortDate.format(date);

export const speedAt = (bytesPerSecond: number) => `${bytes(bytesPerSecond)}/s`;

// ETA stays approximate on purpose; nobody trusts "14:32:07 remaining".
export const etaAt = (bytesLeft: number, bytesPerSecond: number) => {
  if (bytesPerSecond <= 0) {
    return "a while";
  }
  const minutes = Math.ceil(bytesLeft / bytesPerSecond / 60);
  if (minutes < 1) {
    return "about 1 min";
  }
  if (minutes < 60) {
    return `about ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `about ${hours} h ${minutes - hours * 60} min`;
};

export type Tone = "amber" | "blue" | "mut" | "ok" | "rust";

export interface Status {
  readonly long: string;
  readonly short: string;
  readonly tone: Tone;
}

export const totalSize = (delivery: Delivery) =>
  delivery.transfers.reduce((total, transfer) => total + transfer.size, 0);

export interface Rollup {
  readonly confirmed: number;
  readonly failed: boolean;
  readonly inFlight: number;
  readonly interrupted: boolean;
  readonly local: boolean;
  readonly speed: number;
  readonly uploading: boolean;
}

// Fold the tab's transfer progress into a delivery-level picture. A transfer
// the server still calls uploading that this tab does not own is interrupted:
// refresh-resume lands later, so we say so honestly.
export const rollup = (
  delivery: Delivery,
  progressOf: (transferId: string) => TransferProgress | undefined,
): Rollup => {
  let confirmed = 0;
  let failed = false;
  let inFlight = 0;
  let local = false;
  let speed = 0;
  let uploading = false;
  let interrupted = false;
  for (const transfer of delivery.transfers) {
    const progress = progressOf(transfer.id);
    if (transfer.state === "complete") {
      confirmed += transfer.size;
      continue;
    }
    if (transfer.state === "cancelled") {
      continue;
    }
    if (progress === undefined) {
      interrupted = true;
      continue;
    }
    local = true;
    confirmed += progress.confirmed;
    inFlight += progress.inFlight;
    speed += progress.bytesPerSecond;
    failed ||= progress.phase === "failed";
    uploading ||= progress.phase === "queued" || progress.phase === "uploading";
  }
  return { confirmed, failed, inFlight, interrupted, local, speed, uploading };
};

export const statusOf = (delivery: Delivery, roll: Rollup, online: boolean): Status => {
  const total = totalSize(delivery);
  if (delivery.status === "cancelled") {
    return { long: "Cancelled.", short: "Cancelled", tone: "mut" };
  }
  if (delivery.status === "expired") {
    return {
      long: "Expired. Files are deleted.",
      short: "Expired",
      tone: "mut",
    };
  }
  if (delivery.status === "ready") {
    const until = delivery.expiresAt === null ? "" : ` until ${untilDate(delivery.expiresAt)}`;
    return {
      long: `Ready. The link works${until}.`,
      short: `Expires ${delivery.expiresAt === null ? "later" : shortDateAt(delivery.expiresAt)}`,
      tone: "ok",
    };
  }
  if (!online) {
    return {
      long: "Connection lost. We'll continue when you're back online.",
      short: "Paused, offline",
      tone: "amber",
    };
  }
  if (roll.failed) {
    return {
      long: "Something stopped the upload. Retry to keep going.",
      short: "Needs a retry",
      tone: "rust",
    };
  }
  if (roll.uploading) {
    const pct = total === 0 ? 0 : Math.floor((roll.confirmed / total) * 100);
    if (roll.speed <= 0) {
      return {
        long: `${bytes(roll.confirmed)} of ${bytes(total)} confirmed · starting…`,
        short: `${pct}%`,
        tone: "blue",
      };
    }
    return {
      long: `${bytes(roll.confirmed)} of ${bytes(total)} confirmed · ${speedAt(roll.speed)} · ${etaAt(
        total - roll.confirmed,
        roll.speed,
      )} left`,
      short: `${pct}% · ${etaAt(total - roll.confirmed, roll.speed)}`,
      tone: "blue",
    };
  }
  if (roll.local && !roll.interrupted) {
    return { long: "Every byte is uploaded. Finishing up.", short: "Finishing up", tone: "blue" };
  }
  return {
    long: "Interrupted. This browser can't resume it yet.",
    short: "Interrupted",
    tone: "rust",
  };
};

export const toneText: Record<Tone, string> = {
  amber: "text-amber",
  blue: "text-blue",
  mut: "text-mut",
  ok: "text-ok",
  rust: "text-rust",
};

export const toneBar: Record<Tone, string> = {
  amber: "bg-amber",
  blue: "bg-blue",
  mut: "bg-mut/40",
  ok: "bg-ok",
  rust: "bg-rust",
};

export const retentionChoices = [1, 3, 7, 14] as const;

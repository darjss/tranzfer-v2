import type { Delivery } from "@tranzfer/contracts";
import * as Match from "effect/Match";
import { css } from "styled-system/css";

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

// What one file shows. The server state wins; local progress only speaks
// for a transfer this tab still owns, and one it doesn't own is interrupted.
type TransferStatus =
  | { readonly _tag: "Active"; readonly progress: TransferProgress }
  | { readonly _tag: "Cancelled" }
  | { readonly _tag: "Complete" }
  | { readonly _tag: "Failed"; readonly progress: TransferProgress }
  | { readonly _tag: "Interrupted" };

export const transferStatus = (
  transfer: Delivery["transfers"][number],
  local: TransferProgress | undefined,
) =>
  Match.value({ progress: local, state: transfer.state }).pipe(
    Match.withReturnType<TransferStatus>(),
    Match.when({ state: "complete" }, () => ({ _tag: "Complete" })),
    Match.when({ state: "cancelled" }, () => ({ _tag: "Cancelled" })),
    Match.when({ progress: { phase: "failed" } }, ({ progress }) => ({ _tag: "Failed", progress })),
    Match.when({ progress: Match.defined }, ({ progress }) => ({
      _tag: "Active",
      progress,
    })),
    Match.orElse(() => ({ _tag: "Interrupted" })),
  );

const idle = {
  confirmed: 0,
  failed: false,
  inFlight: 0,
  interrupted: false,
  local: false,
  speed: 0,
  uploading: false,
};

type Rollup = typeof idle;

const withProgress = (roll: Rollup, progress: TransferProgress): Rollup => ({
  ...roll,
  confirmed: roll.confirmed + progress.confirmed,
  inFlight: roll.inFlight + progress.inFlight,
  local: true,
  speed: roll.speed + progress.bytesPerSecond,
  uploading: roll.uploading || progress.phase === "queued" || progress.phase === "uploading",
});

const addTransfer = (
  roll: Rollup,
  transfer: Delivery["transfers"][number],
  local: TransferProgress | undefined,
) =>
  Match.valueTags(transferStatus(transfer, local), {
    Active: ({ progress }) => withProgress(roll, progress),
    Cancelled: () => roll,
    Complete: () => ({ ...roll, confirmed: roll.confirmed + transfer.size }),
    Failed: ({ progress }) => ({ ...withProgress(roll, progress), failed: true }),
    Interrupted: () => ({ ...roll, interrupted: true }),
  });

export const rollup = (
  delivery: Delivery,
  progressOf: (transferId: string) => TransferProgress | undefined,
) => {
  let roll = idle;
  for (const transfer of delivery.transfers) {
    roll = addTransfer(roll, transfer, progressOf(transfer.id));
  }
  return roll;
};

// Settled server states win. Past that, failed and interrupted stay visible
// offline: only a genuinely in-flight local upload reads as paused.
export const statusOf = (delivery: Delivery, roll: Rollup, online: boolean) => {
  const total = totalSize(delivery);
  const pct = total === 0 ? 0 : Math.floor((roll.confirmed / total) * 100);
  const progress = `${bytes(roll.confirmed)} of ${bytes(total)} confirmed`;
  const eta = etaAt(total - roll.confirmed, roll.speed);
  return Match.value({ ...roll, online, status: delivery.status }).pipe(
    Match.withReturnType<Status>(),
    Match.when({ status: "cancelled" }, () => ({
      long: "Cancelled.",
      short: "Cancelled",
      tone: "mut",
    })),
    Match.when({ status: "expired" }, () => ({
      long: "Expired. Files are deleted.",
      short: "Expired",
      tone: "mut",
    })),
    Match.when({ status: "ready" }, () => ({
      long: `Ready. The link works${delivery.expiresAt === null ? "" : ` until ${untilDate(delivery.expiresAt)}`}.`,
      short: `Expires ${delivery.expiresAt === null ? "later" : shortDateAt(delivery.expiresAt)}`,
      tone: "ok",
    })),
    Match.when({ failed: true }, () => ({
      long: "Something stopped the upload. Retry to keep going.",
      short: "Needs a retry",
      tone: "rust",
    })),
    Match.when({ local: false }, () => ({
      long: "Interrupted. This browser can't resume it yet.",
      short: "Interrupted",
      tone: "rust",
    })),
    Match.when({ online: false }, () => ({
      long: "Connection lost. We'll continue when you're back online.",
      short: "Paused, offline",
      tone: "amber",
    })),
    Match.when({ speed: (speed) => speed <= 0, uploading: true }, () => ({
      long: `${progress} · starting…`,
      short: `${pct}%`,
      tone: "blue",
    })),
    Match.when({ uploading: true }, () => ({
      long: `${progress} · ${speedAt(roll.speed)} · ${eta} left`,
      short: `${pct}% · ${eta}`,
      tone: "blue",
    })),
    Match.orElse(() => ({
      long: "Every byte is uploaded. Finishing up.",
      short: "Finishing up",
      tone: "blue",
    })),
  );
};

export const toneText: Record<Tone, string> = {
  amber: css({ color: "amber" }),
  blue: css({ color: "blue" }),
  mut: css({ color: "mut" }),
  ok: css({ color: "ok" }),
  rust: css({ color: "rust" }),
};

export const toneBar: Record<Tone, string> = {
  amber: css({ bg: "amber" }),
  blue: css({ bg: "blue" }),
  mut: css({ bg: "mut/40" }),
  ok: css({ bg: "ok" }),
  rust: css({ bg: "rust" }),
};

export const retentionChoices = [1, 3, 7, 14] as const;

import type { Delivery, DeliveryEmail, Transfer } from "@tranzfer/contracts";
import * as Match from "effect/Match";

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

export const files = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

const DAY = 24 * 60 * 60 * 1000;

const sentFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

export const sentAt = (date: Date) => sentFormat.format(date);

const weekdayTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  weekday: "long",
});

/** "Tuesday 14:02" within the last week, "9 Oct, 14:02" before that. */
const when = (date: Date) =>
  Date.now() - date.getTime() < 6 * DAY
    ? weekdayTime.format(date).replace(",", "")
    : sentFormat.format(date);

/**
 * What the sender can honestly say about a download. The recipient's browser
 * reports it, and only a folder save knows a file is whole, so a one-file
 * download in the browser's own manager stays "started".
 */
export const downloadWords = (delivery: Delivery) => {
  const { download } = delivery;
  if (download === null) {
    return "Not downloaded yet";
  }
  const total = delivery.transfers.length;
  if (download.filesSaved === 0) {
    return `Download started ${when(download.startedAt)}`;
  }
  return download.filesSaved >= total
    ? `Downloaded, ${total} of ${files(total)}`
    : `${download.filesSaved} of ${files(total)} downloaded, last ${when(download.lastAt)}`;
};

/** An email this page asked for, with the address it typed. The server keeps none. */
export interface Emailed extends DeliveryEmail {
  readonly to: string;
}

// Cloudflare's code for an address on its list of ones that bounced or complained.
const bounced = "E_RECIPIENT_SUPPRESSED";

/** What the sender can honestly say. Sent means the mail server took it, not that it reached an inbox. */
export const emailWords = (row: Emailed) => {
  if (row.status === "queued") {
    return "Sending";
  }
  if (row.status === "sent") {
    return "Sent";
  }
  if (row.errorCode === bounced) {
    return "Not sent, this address bounced before";
  }
  if (row.errorCode === "held") {
    return "Not sent, this site only emails approved addresses";
  }
  if (row.errorCode === "lost") {
    return "Not sent, it didn't finish. Try again";
  }
  return "Not sent, the mail server refused it";
};

export const emailSummary = (rows: readonly Emailed[]) => {
  const sent = rows.filter((row) => row.status === "sent").length;
  const bounces = rows.filter((row) => row.errorCode === bounced).length;
  const base = `Sent to ${sent} of ${rows.length}`;
  if (bounces === 0) {
    return base;
  }
  return `${base}, ${bounces === 1 ? "one address" : `${bounces} addresses`} bounced`;
};

const untilFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  weekday: "long",
});

export const untilDate = (date: Date) => untilFormat.format(date);

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/** "in 3 days", "tomorrow", "in 5 hours": the expiry as a person says it. */
export const fromNow = (date: Date) => {
  const left = date.getTime() - Date.now();
  if (Math.abs(left) < DAY) {
    const hours = Math.round(left / (60 * 60 * 1000));
    return hours === 0 ? "within the hour" : relative.format(hours, "hour");
  }
  return relative.format(Math.round(left / DAY), "day");
};

export const speedAt = (bytesPerSecond: number) => `${bytes(bytesPerSecond)}/s`;

export const etaAt = (bytesLeft: number, bytesPerSecond: number) => {
  if (bytesPerSecond <= 0) {
    return "a while";
  }
  const minutes = Math.ceil(bytesLeft / bytesPerSecond / 60);
  if (minutes <= 1) {
    return "about a minute";
  }
  if (minutes < 60) {
    return `about ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `about ${hours} h ${minutes - hours * 60} min`;
};

export const totalSize = (delivery: Delivery) =>
  delivery.transfers.reduce((total, transfer) => total + transfer.size, 0);

// What one file shows. The server state wins; local progress only speaks
// for a transfer this tab still owns. needsFile is a transfer this tab can
// continue once the file is picked again; Interrupted means this browser
// holds no record at all, so only cancel and resend remains.
type TransferStatus =
  | { readonly _tag: "Active"; readonly progress: TransferProgress }
  | { readonly _tag: "Cancelled" }
  | { readonly _tag: "Complete" }
  | { readonly _tag: "Elsewhere"; readonly progress: TransferProgress }
  | { readonly _tag: "Failed"; readonly progress: TransferProgress }
  | { readonly _tag: "Interrupted" }
  | { readonly _tag: "NeedsFile"; readonly progress: TransferProgress };

export const transferStatus = (transfer: Transfer, local: TransferProgress | undefined) =>
  Match.value({ progress: local, state: transfer.state }).pipe(
    Match.withReturnType<TransferStatus>(),
    Match.when({ state: "complete" }, () => ({ _tag: "Complete" })),
    Match.when({ state: "cancelled" }, () => ({ _tag: "Cancelled" })),
    Match.when({ progress: { phase: "failed" } }, ({ progress }) => ({ _tag: "Failed", progress })),
    Match.when({ progress: { phase: "elsewhere" } }, ({ progress }) => ({
      _tag: "Elsewhere",
      progress,
    })),
    Match.when({ progress: { phase: "needsFile" } }, ({ progress }) => ({
      _tag: "NeedsFile",
      progress,
    })),
    Match.when({ progress: Match.defined }, ({ progress }) => ({ _tag: "Active", progress })),
    Match.orElse(() => ({ _tag: "Interrupted" })),
  );

const idle = {
  confirmed: 0,
  elsewhere: false,
  failed: false,
  inFlight: 0,
  interrupted: false,
  needsFile: false,
  speed: 0,
  uploading: false,
};

export type Rollup = typeof idle;

const withProgress = (roll: Rollup, progress: TransferProgress): Rollup => ({
  ...roll,
  confirmed: roll.confirmed + progress.confirmed,
  inFlight: roll.inFlight + progress.inFlight,
  speed: roll.speed + progress.bytesPerSecond,
  uploading: roll.uploading || progress.phase === "queued" || progress.phase === "uploading",
});

const addTransfer = (roll: Rollup, transfer: Transfer, local: TransferProgress | undefined) =>
  Match.valueTags(transferStatus(transfer, local), {
    Active: ({ progress }) => withProgress(roll, progress),
    Cancelled: () => roll,
    Complete: () => ({ ...roll, confirmed: roll.confirmed + transfer.size }),
    // What the other tab sent when this one last looked; it only grows.
    Elsewhere: ({ progress }) => ({
      ...roll,
      confirmed: roll.confirmed + progress.confirmed,
      elsewhere: true,
    }),
    Failed: ({ progress }) => ({ ...withProgress(roll, progress), failed: true }),
    Interrupted: () => ({ ...roll, interrupted: true }),
    NeedsFile: ({ progress }) => ({
      ...roll,
      confirmed: roll.confirmed + progress.confirmed,
      needsFile: true,
    }),
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

/** One state per delivery. It picks the board group, the icon and the words. */
export type Kind =
  | "cancelled"
  | "elsewhere"
  | "expired"
  | "failed"
  | "finishing"
  | "interrupted"
  | "moving"
  | "needsFile"
  | "paused"
  | "ready"
  | "starting";

// Settled server states win. Past that, a failure outranks everything local,
// then a transfer waiting on its files, then one this browser can't resume
// at all. Only a genuinely in-flight local upload reads as paused offline.
export const kindOf = (status: Delivery["status"], roll: Rollup, online: boolean) =>
  Match.value({ ...roll, online, status }).pipe(
    Match.withReturnType<Kind>(),
    Match.when({ status: "cancelled" }, () => "cancelled"),
    Match.when({ status: "expired" }, () => "expired"),
    Match.when({ status: "ready" }, () => "ready"),
    Match.when({ failed: true }, () => "failed"),
    Match.when({ needsFile: true }, () => "needsFile"),
    Match.when({ interrupted: true }, () => "interrupted"),
    Match.when({ online: false, uploading: true }, () => "paused"),
    Match.when({ speed: (speed) => speed <= 0, uploading: true }, () => "starting"),
    Match.when({ uploading: true }, () => "moving"),
    Match.when({ elsewhere: true }, () => "elsewhere"),
    Match.orElse(() => "finishing"),
  );

export type Group = "moving" | "interrupted" | "ready" | "ended";

export const groupOf = (kind: Kind) =>
  Match.value(kind).pipe(
    Match.withReturnType<Group>(),
    Match.when("ready", () => "ready"),
    Match.whenOr("interrupted", "needsFile", () => "interrupted"),
    Match.whenOr("cancelled", "expired", () => "ended"),
    Match.orElse(() => "moving"),
  );

/** What a person should know, and do next, in each state (RELIABILITY: what the user sees). */
export const kindWords: Record<Kind, { readonly label: string; readonly detail: string }> = {
  cancelled: { detail: "Cancelled. The link no longer works.", label: "Cancelled" },
  elsewhere: {
    detail: "Another tab is uploading these files. This one updates when it finishes.",
    label: "Sending in another tab",
  },
  expired: { detail: "Expired. The files are deleted.", label: "Expired" },
  failed: {
    detail: "Something stopped the upload. Retry to keep going.",
    label: "Needs a retry",
  },
  finishing: { detail: "Every byte is uploaded. Finishing up on our end.", label: "Finishing up" },
  interrupted: {
    detail:
      "This browser has no record of this upload, so it can't continue it. Cancel it and send the files again.",
    label: "Interrupted",
  },
  moving: { detail: "", label: "Uploading" },
  needsFile: {
    detail: "We need the original files to continue. Parts already uploaded stay uploaded.",
    label: "Needs the files",
  },
  paused: {
    detail: "Connection lost. We'll continue when you're back online.",
    label: "Paused, offline",
  },
  ready: { detail: "Ready. Anyone with the link can download.", label: "Ready" },
  // No speed or time left until R2 has acknowledged real parts.
  starting: { detail: "", label: "Starting…" },
};

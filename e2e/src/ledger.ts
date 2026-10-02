import { partCount, partSize } from "@tranzfer/contracts";

/**
 * The parts ledger. Part bytes go from the browser straight to R2, so the API
 * never sees them; this is the only place a run can prove what crossed the
 * wire. Entries come from the browser's own network events, so "acked" means
 * the browser saw R2 answer 200. A request with no response (aborted, offline,
 * the browser killed mid-flight) has status null: its bytes may or may not
 * have landed, and resending it is never counted as avoidable.
 */
export type R2Kind = "abort" | "complete" | "create" | "list" | "part";

export interface R2Request {
  readonly at: number;
  readonly kind: R2Kind;
  readonly partNumber: number | null;
  /** Which browser launch sent it; a crash and relaunch starts a new one. */
  readonly session: number;
  readonly status: number | null;
  readonly uploadId: string | null;
}

/** Classifies a browser request to R2, or null for anything else (CORS preflights included). */
export const classify = (method: string, url: string) => {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith(".r2.cloudflarestorage.com")) {
    return null;
  }
  const uploadId = parsed.searchParams.get("uploadId");
  const partNumber = parsed.searchParams.get("partNumber");
  let kind: R2Kind | null = null;
  if (method === "POST" && parsed.searchParams.has("uploads")) {
    kind = "create";
  } else if (method === "PUT" && uploadId !== null && partNumber !== null) {
    kind = "part";
  } else if (method === "GET" && uploadId !== null) {
    kind = "list";
  } else if (method === "POST" && uploadId !== null) {
    kind = "complete";
  } else if (method === "DELETE" && uploadId !== null) {
    kind = "abort";
  }
  return kind === null
    ? null
    : { kind, partNumber: partNumber === null ? null : Number(partNumber), uploadId };
};

const isAcked = (request: R2Request) => request.status === 200;

/** Distinct part numbers R2 has acknowledged so far. */
export const ackedParts = (requests: readonly R2Request[]) =>
  new Set(
    requests.flatMap((request) =>
      request.kind === "part" && isAcked(request) && request.partNumber !== null
        ? [request.partNumber]
        : [],
    ),
  );

export const summarize = (requests: readonly R2Request[], fileSize: number) => {
  const size = partSize(fileSize);
  const count = partCount(fileSize);
  const bytesOf = (partNumber: number) =>
    partNumber < count ? size : fileSize - (count - 1) * size;
  const parts = requests.filter((request) => request.kind === "part");
  const acks = new Map<number, number>();
  for (const part of parts) {
    if (isAcked(part) && part.partNumber !== null) {
      acks.set(part.partNumber, (acks.get(part.partNumber) ?? 0) + 1);
    }
  }
  // A part the browser already saw acknowledged and sent again: bytes the
  // product could have proven were on R2 and resent anyway.
  const avoidable = [...acks]
    .filter(([, acked]) => acked > 1)
    .map(([partNumber, acked]) => ({ partNumber, resent: acked - 1 }))
    .toSorted((a, b) => a.partNumber - b.partNumber);
  const unanswered = parts.filter((part) => part.status === null);
  const failed = parts.filter((part) => part.status !== null && !isAcked(part));
  const sum = (list: readonly { partNumber: number | null }[]) =>
    list.reduce(
      (total, part) => total + (part.partNumber === null ? 0 : bytesOf(part.partNumber)),
      0,
    );
  return {
    bytes: {
      // Acknowledged part bytes, file included; anything above `file` was resent.
      acked: sum(parts.filter(isAcked)),
      avoidable: avoidable.reduce(
        (total, part) => total + part.resent * bytesOf(part.partNumber),
        0,
      ),
      file: fileSize,
      // Upper bound: an unanswered or failed request may have sent only some of its body.
      unacknowledged: sum([...unanswered, ...failed]),
    },
    completes: {
      acked: requests.filter((request) => request.kind === "complete" && isAcked(request)).length,
      sent: requests.filter((request) => request.kind === "complete").length,
    },
    creates: {
      acked: requests.filter((request) => request.kind === "create" && isAcked(request)).length,
      sent: requests.filter((request) => request.kind === "create").length,
    },
    parts: {
      acked: [...acks.values()].reduce((total, acked) => total + acked, 0),
      avoidable,
      count,
      failed: failed.map((part) => ({ partNumber: part.partNumber, status: part.status })),
      missing: Array.from({ length: count }, (_, index) => index + 1).filter(
        (partNumber) => !acks.has(partNumber),
      ),
      sent: parts.length,
      size,
      unanswered: unanswered.map((part) => part.partNumber),
    },
    // Every upload id a request named; one transfer, one multipart upload.
    uploadIds: [...new Set(requests.flatMap((request) => request.uploadId ?? []))],
  };
};

export type LedgerSummary = ReturnType<typeof summarize>;

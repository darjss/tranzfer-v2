import { appendFile } from "node:fs/promises";
import path from "node:path";

import { partCount, partSize } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

/**
 * The parts ledger. Part bytes go from the browser straight to R2, so the API
 * never sees them; this is the only place a run can prove what crossed the
 * wire. Entries come from the browser's own network events, so "acked" means
 * the browser saw R2 answer 200. Requests a fault trap fulfills or aborts may
 * be missing or misreported in those events, so the trap's own record (the
 * Deferred NetControl returns) is the source of truth for them. A request with no response (aborted, offline,
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

const STALL_LIMIT = Duration.toMillis("10 minutes");

/**
 * Live ledger fed by browser network events. Entries arrive pending
 * (status null) and settle when the response finishes; a crash or close
 * leaves them pending, which is exactly the ambiguity the summary rules
 * encode. Every settled entry is also appended to <run>/ledger.jsonl.
 */
export class Ledger extends Context.Service<
  Ledger,
  {
    readonly all: Effect.Effect<readonly R2Request[]>;
    readonly record: (request: R2Request) => Effect.Effect<number>;
    readonly settle: (index: number, status: number | null) => Effect.Effect<void>;
    readonly since: (at: number) => Effect.Effect<readonly R2Request[]>;
    /** Resolves when n distinct parts are acked; fails after 10 minutes without a new ack. */
    readonly waitForAcked: (count: number) => Effect.Effect<readonly R2Request[]>;
    /** Resolves with the first 200 for a part sent at or after `since`; fails after 10 minutes. */
    readonly waitForPartAcked: (partNumber: number, since: number) => Effect.Effect<R2Request>;
    /** Resolves with the first request of a kind recorded at or after `at`. */
    readonly waitForRequest: (at: number, kind: R2Request["kind"]) => Effect.Effect<R2Request>;
  }
>()("tranzfer/e2e/Ledger") {
  static readonly layer = (dir: string) =>
    Layer.effect(
      Ledger,
      Effect.gen(function* make() {
        const entries = yield* Ref.make<readonly R2Request[]>([]);
        // One-shot wakeup swapped out on every mutation; waiters re-check.
        const signal = yield* Ref.make(yield* Deferred.make<boolean>());
        const logFile = path.join(dir, "ledger.jsonl");
        // record and settle run synchronously at the playwright edge (a fast
        // requestfinished must find its index already in `pending`), so the
        // jsonl write rides a serialized promise chain instead of a yielded
        // Effect.promise: lines land in event order without an async hop.
        let writes = Promise.resolve();
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await writes;
          }),
        );

        const notify = Effect.gen(function* notify() {
          yield* Deferred.succeed(yield* Ref.get(signal), true);
          yield* Ref.set(signal, yield* Deferred.make<boolean>());
        });

        const record = (request: R2Request) =>
          Effect.gen(function* recordEntry() {
            yield* Ref.update(entries, (all) => [...all, request]);
            yield* notify;
            return (yield* Ref.get(entries)).length - 1;
          });

        const settle = Effect.fn("Ledger.settle")(function* settle(
          index: number,
          status: number | null,
        ) {
          const entry = (yield* Ref.get(entries))[index];
          if (entry === undefined) {
            return;
          }
          // A request that never got a response settles as status null: its
          // bytes may or may not have landed, which is exactly what the
          // summary rules encode.
          const settled = { ...entry, status };
          yield* Ref.update(entries, (all) => all.with(index, settled));
          yield* Effect.sync(() => {
            writes = writes.then(async () => {
              await appendFile(logFile, `${JSON.stringify(settled)}\n`);
            });
          });
          yield* notify;
        });

        const waitForAcked = Effect.fn("Ledger.waitForAcked")(function* waitFor(count: number) {
          let last = -1;
          let deadline = Date.now() + STALL_LIMIT;
          for (;;) {
            // Take the wakeup before reading: a notify landing between the
            // read and the deferred lookup would otherwise be missed.
            const wakeup = yield* Ref.get(signal);
            const all = yield* Ref.get(entries);
            const acked = ackedParts(all).size;
            if (acked >= count) {
              return all;
            }
            if (acked > last) {
              last = acked;
              deadline = Date.now() + STALL_LIMIT;
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
              return yield* Effect.die(
                new Error(`stalled: no new part acknowledged for 10 minutes at ${acked}/${count}`),
              );
            }
            yield* Deferred.await(wakeup).pipe(Effect.timeout(remaining), Effect.ignore);
          }
        });

        const waitForRequest = Effect.fn("Ledger.waitForRequest")(function* waitForRequest(
          at: number,
          kind: R2Request["kind"],
        ) {
          const deadline = Date.now() + STALL_LIMIT;
          for (;;) {
            const wakeup = yield* Ref.get(signal);
            const found = (yield* Ref.get(entries)).find(
              (request) => request.at >= at && request.kind === kind,
            );
            if (found !== undefined) {
              return found;
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
              return yield* Effect.die(
                new Error(`stalled: no ${kind} request seen for 10 minutes`),
              );
            }
            yield* Deferred.await(wakeup).pipe(Effect.timeout(remaining), Effect.ignore);
          }
        });

        const waitForPartAcked = Effect.fn("Ledger.waitForPartAcked")(function* waitForPart(
          partNumber: number,
          since: number,
        ) {
          const deadline = Date.now() + STALL_LIMIT;
          for (;;) {
            const wakeup = yield* Ref.get(signal);
            const found = (yield* Ref.get(entries)).find(
              (request) =>
                request.at >= since &&
                request.kind === "part" &&
                request.partNumber === partNumber &&
                isAcked(request),
            );
            if (found !== undefined) {
              return found;
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
              return yield* Effect.die(
                new Error(`stalled: part ${partNumber} not acknowledged for 10 minutes`),
              );
            }
            yield* Deferred.await(wakeup).pipe(Effect.timeout(remaining), Effect.ignore);
          }
        });

        return Ledger.of({
          all: Ref.get(entries),
          record,
          settle,
          since: (at: number) =>
            Effect.map(Ref.get(entries), (all) => all.filter((request) => request.at >= at)),
          waitForAcked,
          waitForPartAcked,
          waitForRequest,
        });
      }),
    );
}

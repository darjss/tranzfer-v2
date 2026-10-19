import type { Uppy } from "@uppy/core";
import type { Body } from "@uppy/core/utils";
import { basename, partSize } from "@tranzfer/contracts";
import type { Delivery, DeliveryId, LinkToken, Transfer, TransferId } from "@tranzfer/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import type * as FiberSet from "effect/FiberSet";
import type { ApiClient } from "../api/client";
import { retryTransport } from "../api/retry";
import { chosenPath } from "./files";
import { ledger } from "./ledger";
import { fingerprint, forget, readAll } from "./recovery";
import type { RecoveryRecord } from "./recovery";
import type { UploadSpans } from "./spans";
import { patchTransfer, transfers } from "./store";
import { claim, sendingElsewhere } from "./tabs";
import { finalizeFor, listRemoteParts, partBytes, retryWhileNotUploaded, start } from "./transport";
import type { TransferMeta } from "./transport";
import type { ListedPart, VerifyReply, VerifyRequest } from "./verify";

// Picking transfers back up after a refresh or a closed tab: rebuild their
// progress from the records, then reattach the files the user picks again.

type RunFork = Effect.Success<ReturnType<typeof FiberSet.makeRuntime<never>>>;

// RequestUploads reads this many delivery ids at a time.
const MAX_RECOVERED = 50;
// R2 drops incomplete multipart uploads after 7 days; a record that old
// whose delivery no longer lists is only clutter.
const RECORD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// The pick waits on this hashing, and it can run for minutes, so it lives in a
// worker: on the page thread each 64 MiB part was a ~120 ms long task. Worker
// events are the adapter edge; a read or hash failure becomes UnknownError and
// the caller reports the file as unreadable.
const verifyInWorker = (
  file: Blob,
  parts: readonly ListedPart[],
  partSizeBytes: number,
  onChecked: (bytes: number) => void,
) =>
  Effect.callback<boolean, Cause.UnknownError>((resume) => {
    const worker = new Worker(new URL("hash.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", ({ data }: MessageEvent<VerifyReply>) => {
      if ("checked" in data) {
        onChecked(data.checked);
      } else if ("ok" in data) {
        resume(Effect.succeed(data.ok));
      } else {
        resume(Effect.fail(new Cause.UnknownError(undefined, "hash worker failed")));
      }
    });
    worker.addEventListener("error", (event) => {
      resume(Effect.fail(new Cause.UnknownError(event, "hash worker crashed")));
    });
    // The options form: a worker takes a transfer list, not a target origin.
    worker.postMessage({ file, partSize: partSizeBytes, parts } satisfies VerifyRequest, {
      transfer: [],
    });
    // Interrupting the pick terminates the worker mid-hash.
    return Effect.sync(() => {
      worker.terminate();
    });
  });

/**
 * Rebuilds local progress for deliveries this tab doesn't own. A transfer
 * the server still sees as uploading becomes needsFile: the bytes are
 * there, but the resume needs the file picked again. Finalizing gets one
 * finalize attempt; any failure also lands on needsFile, since only a
 * reselected file can push the missing parts. One that another live tab
 * holds the lock for becomes elsewhere and is left to that tab.
 */
export const restore = Effect.fn("Uploads.restore")(function* restore(
  api: ApiClient["Service"],
  runFork: RunFork,
  deliveries: readonly Pick<Delivery, "transfers">[],
  // The file request the deliveries came in through, for an uploader.
  token?: LinkToken,
) {
  const records = yield* readAll;
  const elsewhere = yield* sendingElsewhere;
  const byTransfer = new Map(
    deliveries.flatMap((delivery) =>
      delivery.transfers.map((transfer) => [transfer.id, transfer] as const),
    ),
  );
  const forgotten: TransferId[] = [];
  for (const record of records) {
    const transfer = byTransfer.get(record.transferId);
    if (transfer === undefined) {
      if (Date.now() - record.createdAt > RECORD_WINDOW_MS) {
        forgotten.push(record.transferId);
      }
      continue;
    }
    // A transfer already in the store belongs to this tab; leave it alone.
    // One marked elsewhere is only waiting for the other tab to let go.
    const local = transfers[transfer.id];
    if (local !== undefined && local.phase !== "elsewhere") {
      continue;
    }
    if (token !== undefined) {
      ledger.entry(transfer.id, transfer.objectKey).token = token;
    }
    if (transfer.state === "complete" || transfer.state === "cancelled") {
      forgotten.push(transfer.id);
    } else if (elsewhere.has(transfer.id)) {
      patchTransfer(transfer.id, { confirmed: record.confirmed, phase: "elsewhere" });
    } else if (transfer.state === "finalizing") {
      patchTransfer(transfer.id, { confirmed: record.confirmed, phase: "finalizing" });
      runFork(
        retryWhileNotUploaded(finalizeFor(api, transfer.id)).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.sync(() => {
                patchTransfer(transfer.id, { error, phase: "needsFile" });
              }),
            onSuccess: () =>
              Effect.andThen(
                Effect.sync(() => {
                  patchTransfer(transfer.id, { phase: "done" });
                }),
                forget([transfer.id]),
              ),
          }),
        ),
      );
    } else {
      patchTransfer(transfer.id, { confirmed: record.confirmed, phase: "needsFile" });
    }
  }
  yield* forget(forgotten);
});

/**
 * Reattaches picked files to transfers waiting on them. Only a file that
 * still matches its record - same name, size, mtime, part-size policy and
 * fingerprint - uploads; everything else is reported back for the UI to
 * explain (law 3: never resume against an unverified file).
 */
export const resume = Effect.fn("Uploads.resume")(function* resume(
  api: ApiClient["Service"],
  spans: UploadSpans["Service"],
  runFork: RunFork,
  engine: Effect.Effect<Uppy<TransferMeta, Body>>,
  delivery: Pick<Delivery, "id" | "transfers">,
  files: readonly File[],
  // Bytes of stored parts hashed so far, out of those listed so far.
  onChecking?: (progress: { readonly checked: number; readonly total: number }) => void,
  // The file request the delivery came in through, for an uploader.
  token?: LinkToken,
) {
  const uppy = yield* engine;
  if (token !== undefined) {
    for (const transfer of delivery.transfers) {
      ledger.entry(transfer.id, transfer.objectKey).token = token;
    }
  }
  const records = yield* readAll;
  const recordOf = new Map(records.map((record) => [record.transferId, record]));
  const candidates = delivery.transfers.filter(
    (transfer) => transfers[transfer.id]?.phase === "needsFile" && recordOf.has(transfer.id),
  );
  const claimed = new Set<TransferId>();
  // Totals across every file of this pick: listed grows as each file's parts
  // are listed, spent is what finished files already hashed.
  let listedBytes = 0;
  let spentBytes = 0;
  const problems: {
    name: string;
    problem: "changed" | "gone" | "policy" | "unreadable" | "unknown";
  }[] = [];
  for (const file of files) {
    // Repeated basenames are legal (a/clip.mov, b/clip.mov), so every
    // unclaimed name match is a candidate; the full path ranks first.
    const picked = chosenPath(file);
    const matching = candidates
      .filter(
        (candidate) =>
          !claimed.has(candidate.id) &&
          basename(recordOf.get(candidate.id)?.path ?? "") === file.name,
      )
      .toSorted(
        (a, b) =>
          Number(recordOf.get(b.id)?.path === picked) - Number(recordOf.get(a.id)?.path === picked),
      );
    let first: "changed" | "gone" | "policy" | "unreadable" | undefined;
    let matched:
      | {
          listed: readonly ListedPart[];
          record: RecoveryRecord;
          transfer: Transfer;
          verifyMillis: number;
        }
      | undefined;
    for (const candidate of matching) {
      const record = recordOf.get(candidate.id);
      if (record === undefined) {
        continue;
      }
      const verifyStarted = yield* Clock.currentTimeMillis;
      let problem: "changed" | "gone" | "policy" | "unreadable" | undefined;
      let listed: readonly ListedPart[] = [];
      if (record.size !== file.size || record.lastModified !== file.lastModified) {
        problem = "changed";
      } else if (record.partSize === partSize(file.size)) {
        problem = yield* fingerprint(file).pipe(
          Effect.map((print) =>
            print.sha256 === record.fingerprint.sha256 ? undefined : ("changed" as const),
          ),
          Effect.catch(() => Effect.succeed("unreadable" as const)),
        );
      } else {
        problem = "policy";
      }
      // The sampled fingerprint can't see edits between samples; the parts
      // R2 holds must hash to their ETags against this file. A record with
      // no uploadId has nothing remote to verify.
      if (problem === undefined && record.uploadId !== undefined) {
        const remote = yield* listRemoteParts(
          api,
          candidate.id,
          candidate.objectKey,
          record.uploadId,
        );
        listed = remote === "gone" ? [] : remote;
        const heldBytes = listed.reduce((total, part) => total + part.size, 0);
        const before = spentBytes;
        const total = listedBytes + heldBytes;
        onChecking?.({ checked: before, total });
        problem =
          remote === "gone"
            ? "gone"
            : yield* verifyInWorker(file, remote, record.partSize, (checked) => {
                onChecking?.({ checked: before + checked, total });
              }).pipe(
                Effect.map((ok) => (ok ? undefined : ("changed" as const))),
                Effect.catch(() => Effect.succeed("unreadable" as const)),
              );
        listedBytes = total;
        spentBytes = before + heldBytes;
      }
      if (problem === undefined) {
        matched = {
          listed,
          record,
          transfer: candidate,
          verifyMillis: (yield* Clock.currentTimeMillis) - verifyStarted,
        };
        break;
      }
      first ??= problem;
    }
    if (matched === undefined) {
      if (first === undefined) {
        problems.push({ name: file.name, problem: "unknown" });
      } else {
        problems.push({ name: file.name, problem: first });
      }
      continue;
    }
    const { listed, record, transfer, verifyMillis } = matched;
    claimed.add(transfer.id);
    const done = new Set(listed.map((part) => part.partNumber));
    ledger.entry(transfer.id, transfer.objectKey).doneParts = done;
    const fileId = uppy.addFile({
      data: file,
      meta: {
        deliveryId: delivery.id,
        objectKey: transfer.objectKey,
        relativePath: transfer.objectKey,
        transferId: transfer.id,
      },
      name: file.name,
      type: file.type,
    });
    if (record.uploadId !== undefined) {
      uppy.setFileState(fileId, {
        s3Multipart: { key: transfer.objectKey, uploadId: record.uploadId },
      });
    }
    patchTransfer(transfer.id, {
      confirmed: partBytes(done, transfer.size),
      error: undefined,
      phase: "queued",
    });
    claim(transfer.id);
    yield* spans.beginFile(delivery.id, transfer, true);
    yield* spans.note(transfer.id, "resume.verified", {
      bytes: partBytes(done, transfer.size),
      "duration.ms": verifyMillis,
      parts: listed.length,
    });
    runFork(start(spans, uppy, fileId, transfer.id));
  }
  yield* Effect.annotateCurrentSpan({
    "resume.matched": claimed.size,
    "resume.problems": problems.length,
  });
  return problems;
});

/**
 * What an uploader's browser can recover on a file request page: the
 * deliveries it remembers plus the ones sent since the page opened, read
 * back through the token. Unfinished ones are restored like the owner's.
 */
export const recoverRequest = Effect.fn("Uploads.recoverRequest")(function* recoverRequest(
  api: ApiClient["Service"],
  runFork: RunFork,
  token: LinkToken,
  sentHere: readonly DeliveryId[],
) {
  const records = yield* readAll;
  const remembered = records
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .map((record) => record.deliveryId);
  const ids = [...new Set([...sentHere, ...remembered])].slice(0, MAX_RECOVERED);
  const found =
    ids.length === 0 ? [] : yield* retryTransport(api.RequestUploads({ deliveryIds: ids, token }));
  yield* restore(api, runFork, found, token);
  return found;
});

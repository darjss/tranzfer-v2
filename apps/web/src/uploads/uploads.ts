import type { AwsS3Options } from "@uppy/aws-s3";
import AwsS3 from "@uppy/aws-s3";
import { Uppy } from "@uppy/core";
import type { Body, Meta } from "@uppy/core/utils";
import { DeliveryId, partSize, RelativePath, TransferId } from "@tranzfer/contracts";
import type { Delivery, RetentionDays, Transfer, UploadRequest } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { md5 } from "hash-wasm";

import { ApiClient } from "../api/client";
import {
  fingerprint,
  forget,
  readAll,
  recordConfirmed,
  recordUploadId,
  remember,
} from "./recovery";
import type { RecoveryRecord } from "./recovery";
import { patchTransfer, transfers, wireWindow } from "./store";

type SignRequest = Extract<
  AwsS3Options<TransferMeta, Body>,
  { signRequest: unknown }
>["signRequest"];
type PresignableRequest = Parameters<SignRequest>[0];

interface TransferMeta extends Meta {
  readonly deliveryId: DeliveryId;
  readonly objectKey: string;
  // Uppy derives file ids from relativePath and rejects duplicates, so the
  // path alone would refuse the same file in a second delivery.
  readonly relativePath: string;
  readonly transferId: TransferId;
}

const SPEED_EMA = 0.25;
const SKIPPED = /^\.DS_Store$|^Thumbs\.db$/u;
const isSkipped = (path: string) =>
  path.split("/").some((segment) => SKIPPED.test(segment) || segment.startsWith("._"));

export interface ChosenFile {
  readonly file: File;
  readonly path: string;
}

// relativePath covers drops and webkitRelativePath folder picks; both are ""
// on plain picks, so an empty relative path falls through to the file name.
const chosenPath = (file: File & { relativePath?: string }) => {
  const relative = file.relativePath ?? file.webkitRelativePath;
  return (relative === undefined || relative === "" ? file.name : relative).replace(/^\/+/u, "");
};

export const chosenFiles = (files: Iterable<File>) => {
  const chosen: ChosenFile[] = [];
  for (const file of files) {
    const path = chosenPath(file);
    if (path !== "" && !isSkipped(path)) {
      chosen.push({ file, path });
    }
  }
  return chosen;
};

export const invalidPaths = (files: readonly ChosenFile[]) =>
  files.filter(({ path }) => !Schema.is(RelativePath)(path)).map(({ path }) => path);

export const deliveryTitle = (files: readonly ChosenFile[]) => {
  const [first] = files;
  if (first === undefined) {
    return "Delivery";
  }
  const [top] = first.path.split("/");
  if (files.length > 1 && files.every(({ path }) => path.startsWith(`${top}/`))) {
    return top;
  }
  if (files.length === 1) {
    return first.file.name;
  }
  return `${first.file.name} and ${files.length - 1} more`;
};

// Aborts are never signed: cancel is a server-side operation, and signing
// one would be a bug. A PUT without an upload id is an empty file: Uppy
// sends only those as a single request.
export const toUploadRequest = (request: PresignableRequest): UploadRequest | null => {
  if (!("uploadId" in request)) {
    if (request.method === "POST") {
      return { _tag: "Create" };
    }
    return request.method === "PUT" ? { _tag: "Put" } : null;
  }
  if (request.method === "PUT") {
    return { _tag: "Part", partNumber: request.partNumber, uploadId: request.uploadId };
  }
  if (request.method === "GET") {
    return request.partNumberMarker === undefined
      ? { _tag: "List", uploadId: request.uploadId }
      : {
          _tag: "List",
          partNumberMarker: request.partNumberMarker,
          uploadId: request.uploadId,
        };
  }
  if (request.method === "POST") {
    return { _tag: "Complete", uploadId: request.uploadId };
  }
  return null;
};

// R2 can take a moment to make a completed multipart object visible to HEAD,
// so finalize retries NotUploaded with backoff; any other failure is final.
export const retryWhileNotUploaded = <A, E extends { readonly _tag: string }, R>(
  finalize: Effect.Effect<A, E, R>,
) =>
  finalize.pipe(
    Effect.retry({
      schedule: Schedule.exponential("800 millis"),
      times: 3,
      while: (error) => error._tag === "NotUploaded",
    }),
  );

// The 40-try cap counts failures, not elapsed time, so a sleep/wake clock
// jump cannot end it early; each backoff delay is capped at 30 seconds.
const RETRY_CAP = Duration.seconds(30);
const MAX_TRANSPORT_RETRIES = 40;

// Losing the network is a pause, not an error (law 7). Offline time waits on
// the `online` event and burns no attempts.
export const untilOnline: Effect.Effect<void> = Effect.suspend(() =>
  navigator.onLine
    ? Effect.void
    : Effect.callback((resume) => {
        const done = () => {
          resume(Effect.void);
        };
        window.addEventListener("online", done, { once: true });
        return Effect.sync(() => {
          window.removeEventListener("online", done);
        });
      }),
);

// Transport failures retry; typed refusals (UploadClosed, InvalidUpload,
// Unauthorized) are the server's answer and stand.
export const retryTransport = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  untilOnline.pipe(Effect.andThen(effect)).pipe(
    Effect.retry({
      schedule: Schedule.exponential("1 second").pipe(
        Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, RETRY_CAP))),
      ),
      times: MAX_TRANSPORT_RETRIES,
      while: (error) => error._tag === "RpcClientError",
    }),
  );

// Uppy's S3 errors aren't exported, so match on name (S3Error sets name to
// the class name). Network loss, an expired signature (403, law 6), timeouts,
// throttling and 5xx come back on their own; 404 is the multipart upload
// gone, which must never restart silently.
const s3Error = Schema.Struct({ name: Schema.String, status: Schema.optional(Schema.Number) });

export const isTransientUploadError = (error: Error) => {
  if (!Schema.is(s3Error)(error)) {
    return false;
  }
  if (error.name === "S3NetworkError") {
    return true;
  }
  if (error.name !== "S3ServiceError" || error.status === undefined) {
    return false;
  }
  return (
    error.status === 403 || error.status === 408 || error.status === 429 || error.status >= 500
  );
};

const basename = (path: string) => path.split("/").pop() ?? path;

/** One part R2 lists for an open upload. Its ETag is the part's MD5 hex. */
export interface ListedPart {
  readonly etag: string;
  readonly partNumber: number;
  readonly size: number;
}

/**
 * The fingerprint samples 16 spots, so an edit between samples could pass it.
 * Parts R2 already holds must hash to their ETags against the picked file, or
 * the resumed upload would seal an object mixing old and new bytes. Reads one
 * part at a time, so a partSize-worth of memory is the peak.
 */
export const verifyParts = (file: Blob, parts: readonly ListedPart[], partSizeBytes: number) =>
  Effect.tryPromise(async () => {
    // Sequential on purpose: parallel reads would hold every part in memory.
    const check = async (index: number): Promise<boolean> => {
      const part = parts[index];
      if (part === undefined) {
        return true;
      }
      const start = (part.partNumber - 1) * partSizeBytes;
      const expected = Math.min(partSizeBytes, file.size - start);
      if (part.partNumber < 1 || expected <= 0 || part.size !== expected) {
        return false;
      }
      const digest = await md5(
        new Uint8Array(await file.slice(start, start + partSizeBytes).arrayBuffer()),
      );
      return digest === part.etag && (await check(index + 1));
    };
    return await check(0);
  });

// retryUpload, not upload(): upload() would first re-run every failed file
// in Uppy, other deliveries' included, so each file starts on its own.
// Per-file errors flow through upload-error; a rejection here is a
// pre-flight failure no event covers. Interrupting this fiber does not
// abort the upload: the promise has no signal.
const start = (uppy: Uppy<TransferMeta, Body>, fileId: string, transferId: TransferId) =>
  Effect.tryPromise(async () => await uppy.retryUpload(fileId)).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        patchTransfer(transferId, { bytesPerSecond: 0, error: error.cause, phase: "failed" });
      }),
    ),
  );

const make = Effect.gen(function* makeUploads() {
  const api = yield* ApiClient;
  // Background work (finalize, per-file starts) runs in fibers owned by this
  // layer, so it belongs to the app runtime rather than to a component.
  const runFork = yield* FiberSet.makeRuntime();
  const runPromise = yield* FiberSet.makeRuntimePromise();
  const rates = new Map<string, { at: number; bytes: number }>();
  // objectKey -> transferId, for every file this tab sent or resumed. Signing
  // hands us keys, so this is how a signed request finds its record.
  const keys = new Map<string, TransferId>();
  // transferId -> the uploadId already persisted; a new multipart upload for
  // the same transfer records again.
  const uploadIdStored = new Map<TransferId, string>();
  // Complete signed means the bytes may already be a finished object; an
  // error after this point reconciles instead of restarting transport.
  const completeSigned = new Set<TransferId>();
  // transferId -> transport retries spent; any acknowledged part resets the
  // budget because progress proves transport works.
  const autoRetries = new Map<TransferId, number>();

  const sampleSpeed = (transferId: string, bytesUploaded: number) => {
    const now = Date.now();
    const previous = rates.get(transferId);
    rates.set(transferId, { at: now, bytes: bytesUploaded });
    if (previous === undefined || now === previous.at || bytesUploaded <= previous.bytes) {
      return null;
    }
    return ((bytesUploaded - previous.bytes) / (now - previous.at)) * 1000;
  };

  const sign = Effect.fn("Uploads.sign")(function* sign(request: PresignableRequest) {
    const upload = toUploadRequest(request);
    if (upload === null) {
      return yield* Effect.die(new Error(`Tranzfer never signs this ${request.method}`));
    }
    // The upload id first reaches the browser inside a signed URL; the record
    // has to hold it before that URL can be lost with the tab.
    const transferId = keys.get(request.key);
    if (
      transferId !== undefined &&
      "uploadId" in request &&
      uploadIdStored.get(transferId) !== request.uploadId
    ) {
      uploadIdStored.set(transferId, request.uploadId);
      yield* recordUploadId(transferId, request.uploadId);
    }
    const signed = yield* retryTransport(api.SignUpload({ key: request.key, request: upload }));
    if (upload._tag === "Complete" && transferId !== undefined) {
      completeSigned.add(transferId);
    }
    // The headers are part of the signature (an empty file's PUT carries
    // if-none-match), so Uppy must send them as given.
    return { headers: signed.headers, url: signed.url };
  });

  // Lists the parts R2 holds for an upload id, following every page. "gone"
  // means the multipart upload itself vanished (404 or NoSuchUpload), and no
  // resume may start a new one in its place.
  const listRemoteParts = Effect.fn("Uploads.listRemoteParts")(function* listRemoteParts(
    objectKey: string,
    uploadId: string,
  ) {
    const parts: ListedPart[] = [];
    let marker: number | undefined;
    for (;;) {
      const signed = yield* retryTransport(
        api.SignUpload({
          key: objectKey,
          request:
            marker === undefined
              ? { _tag: "List", uploadId }
              : { _tag: "List", partNumberMarker: marker, uploadId },
        }),
      );
      const response = yield* Effect.tryPromise(
        async () => await fetch(signed.url, { headers: signed.headers }),
      );
      const xml = yield* Effect.tryPromise(async () => await response.text());
      if (response.status === 404 || xml.includes("NoSuchUpload")) {
        return "gone" as const;
      }
      if (!response.ok) {
        return yield* Effect.die(new Error(`ListParts returned ${response.status}`));
      }
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      for (const element of doc.querySelectorAll("Part")) {
        const etag = element.querySelector("ETag")?.textContent ?? "";
        parts.push({
          etag: etag.replaceAll('"', ""),
          partNumber: Number(element.querySelector("PartNumber")?.textContent),
          size: Number(element.querySelector("Size")?.textContent),
        });
      }
      if (doc.querySelector("IsTruncated")?.textContent !== "true") {
        return parts;
      }
      const next = doc.querySelector("NextPartNumberMarker")?.textContent;
      if (next === undefined || next === null) {
        return parts;
      }
      marker = Number(next);
    }
  });

  // The uploader has already detached from this file by the time finish
  // settles, so removing it frees memory without firing an abort.
  const settled = (uppy: Uppy<TransferMeta, Body>, fileId: string, transferId: TransferId) =>
    Effect.gen(function* settle() {
      patchTransfer(transferId, { bytesPerSecond: 0, phase: "done" });
      completeSigned.delete(transferId);
      autoRetries.delete(transferId);
      uppy.removeFile(fileId);
      yield* forget([transferId]);
    });

  // Once the bytes are in R2, finishing is the FinalizeTransfer retry loop.
  // Both the upload-success path and a post-upload retry go through this.
  const finish = Effect.fn("Uploads.finish")(function* finish(
    uppy: Uppy<TransferMeta, Body>,
    fileId: string,
    transferId: TransferId,
  ) {
    return yield* retryWhileNotUploaded(retryTransport(api.FinalizeTransfer({ transferId }))).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.sync(() => {
            patchTransfer(transferId, { error, phase: "failed" });
          }),
        onSuccess: () => settled(uppy, fileId, transferId),
      }),
    );
  });

  // One Uppy for the session, created on first use. It is never destroyed,
  // uninstalled or cancelled by component cleanup or navigation: Uppy aborts
  // remote uploads on uninstall and on file removal, and the server refuses
  // to sign aborts anyway, so teardown would silently kill in-flight work
  // (law 11).
  const engine = yield* Effect.cached(
    Effect.sync(() => {
      wireWindow();
      const uppy = new Uppy<TransferMeta, Body>({ autoProceed: false });
      uppy.use(AwsS3<TransferMeta, Body>, {
        allowedMetaFields: [],
        generateObjectKey: (file) => file.meta.objectKey,
        getChunkSize: ({ size }) => partSize(size),
        // Every file is multipart so finalize can seal its key (see
        // RELIABILITY.md). Uppy still sends an empty file as a single PUT.
        shouldUseMultipart: () => true,
        signRequest: async (request) => await runPromise(sign(request)),
      });

      uppy.on("s3-multipart:part-uploaded", (file, part) => {
        const size = file.size ?? 0;
        // PartNumber × partSize is exact here because Uppy 6 uploads one
        // file's parts sequentially and resumes by skipping parts the server
        // lists, so a completed part N implies parts 1..N-1 are also done.
        const confirmed = Math.min(partSize(size) * part.PartNumber, size);
        autoRetries.delete(file.meta.transferId);
        patchTransfer(file.meta.transferId, { confirmed, phase: "uploading" });
        runFork(recordConfirmed(file.meta.transferId, confirmed));
      });

      uppy.on("upload-progress", (file, progress) => {
        if (file === undefined) {
          return;
        }
        const { transferId } = file.meta;
        const uploaded = progress.bytesUploaded;
        const current = transfers[transferId];
        const previousSpeed = current?.bytesPerSecond ?? 0;
        const sample = sampleSpeed(transferId, uploaded);
        let smoothed = previousSpeed;
        if (sample !== null) {
          smoothed =
            previousSpeed === 0 ? sample : previousSpeed * (1 - SPEED_EMA) + sample * SPEED_EMA;
        }
        patchTransfer(transferId, {
          bytesPerSecond: smoothed,
          inFlight: Math.max(uploaded - (current?.confirmed ?? 0), 0),
          phase: "uploading",
        });
      });

      uppy.on("upload-success", (file) => {
        if (file === undefined) {
          return;
        }
        const { transferId } = file.meta;
        patchTransfer(transferId, {
          confirmed: Math.max(file.size ?? 0, transfers[transferId]?.confirmed ?? 0),
          inFlight: 0,
          phase: "finalizing",
          uploaded: true,
        });
        runFork(finish(uppy, file.id, transferId));
      });

      uppy.on("upload-error", (file, error) => {
        if (file === undefined) {
          return;
        }
        const { transferId } = file.meta;
        // Complete was already signed, so the object may exist; reconcile
        // through FinalizeTransfer instead of starting transport again.
        if (completeSigned.has(transferId)) {
          patchTransfer(transferId, { bytesPerSecond: 0, inFlight: 0, phase: "finalizing" });
          runFork(finish(uppy, file.id, transferId));
          return;
        }
        const attempts = autoRetries.get(transferId) ?? 0;
        if (isTransientUploadError(error) && attempts < MAX_TRANSPORT_RETRIES) {
          autoRetries.set(transferId, attempts + 1);
          // Keep phase uploading: the board already shows the paused copy
          // while offline ("Connection lost…"). retryUpload resumes the same
          // multipart upload because Uppy keeps s3Multipart on error, so
          // ListParts skips stored parts (law 5). A 404 there surfaces as
          // non-transient and fails honestly on the next upload-error.
          patchTransfer(transferId, { bytesPerSecond: 0, inFlight: 0, phase: "uploading" });
          const delay = Duration.min(Duration.seconds(2 ** attempts), RETRY_CAP);
          runFork(
            untilOnline.pipe(
              Effect.andThen(Effect.sleep(delay)),
              // A cancel removes the file and a manual Retry sets its error to
              // null; either means this retry must not fire.
              Effect.andThen(
                Effect.suspend(() => {
                  const current = uppy.getFile(file.id);
                  return current === undefined ||
                    current.error === null ||
                    current.error === undefined
                    ? Effect.void
                    : start(uppy, file.id, transferId);
                }),
              ),
            ),
          );
          return;
        }
        patchTransfer(transferId, {
          bytesPerSecond: 0,
          error,
          inFlight: 0,
          phase: "failed",
        });
      });

      return uppy;
    }),
  );

  const send = Effect.fn("Uploads.send")(function* send(
    files: readonly ChosenFile[],
    retentionDays: RetentionDays,
  ) {
    const uppy = yield* engine;
    // Fingerprints and ids are fixed before anything is sent, so a retried
    // CreateDelivery replays the same delivery instead of making a second.
    const prepared = yield* Effect.forEach(
      files,
      ({ file, path }) =>
        Effect.map(fingerprint(file), (print) => ({
          file,
          path,
          print,
          transferId: TransferId.make(crypto.randomUUID()),
        })),
      { concurrency: 4 },
    );
    const deliveryId = DeliveryId.make(crypto.randomUUID());
    const payload = {
      files: prepared.map(({ file, path, transferId }) => ({
        contentType: file.type === "" ? null : file.type,
        id: transferId,
        lastModified: file.lastModified,
        path,
        size: file.size,
      })),
      id: deliveryId,
      retentionDays,
      title: deliveryTitle(files),
    };
    // The records land before CreateDelivery: a create whose response is lost
    // still leaves enough behind for restore to find the transfers.
    yield* remember(
      prepared.map(({ file, path, print, transferId }): RecoveryRecord => ({
        confirmed: 0,
        createdAt: Date.now(),
        deliveryId,
        fingerprint: print,
        lastModified: file.lastModified,
        partSize: partSize(file.size),
        path,
        size: file.size,
        transferId,
        version: 1,
      })),
    );
    const delivery = yield* api.CreateDelivery(payload).pipe(
      Effect.retry({
        schedule: Schedule.exponential("1 second"),
        times: 5,
        while: (error) => error._tag === "RpcClientError",
      }),
      // A conflict means these ids already belong to different content, so
      // nothing from this attempt exists to resume; its records go.
      Effect.catchTag("DeliveryConflict", (error) =>
        Effect.andThen(forget(prepared.map(({ transferId }) => transferId)), Effect.fail(error)),
      ),
    );

    const byPath = new Map(delivery.transfers.map((transfer) => [transfer.path, transfer]));
    const added: { fileId: string; transferId: TransferId }[] = [];
    // All or nothing: the delivery exists, but if any file can't be queued
    // none will upload. Drop what landed and cancel the delivery, so no row
    // is left whose Retry has no file behind it.
    yield* Effect.try(() => {
      for (const { file, path } of files) {
        const transfer = byPath.get(path);
        if (transfer === undefined) {
          continue;
        }
        patchTransfer(transfer.id, { phase: "queued" });
        keys.set(transfer.objectKey, transfer.id);
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
        added.push({ fileId, transferId: transfer.id });
      }
    }).pipe(
      Effect.catch((error) =>
        Effect.gen(function* dropQueued() {
          for (const { fileId } of added) {
            uppy.removeFile(fileId);
          }
          for (const transfer of delivery.transfers) {
            keys.delete(transfer.objectKey);
            completeSigned.delete(transfer.id);
            autoRetries.delete(transfer.id);
            patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
          }
          yield* forget(delivery.transfers.map((transfer) => transfer.id));
          // If this cancel fails too, the sweeper ends the open delivery.
          yield* Effect.ignore(api.CancelDelivery({ deliveryId: delivery.id }));
          return yield* Effect.die(error.cause);
        }),
      ),
    );
    for (const { fileId, transferId } of added) {
      runFork(start(uppy, fileId, transferId));
    }
    return delivery;
  });

  const retry = Effect.fn("Uploads.retry")(function* retry(transferId: TransferId) {
    const uppy = yield* engine;
    const file = uppy.getFiles().find((candidate) => candidate.meta.transferId === transferId);
    if (file === undefined) {
      return;
    }
    if (transfers[transferId]?.uploaded) {
      // Uppy finished, so the object exists and only FinalizeTransfer failed;
      // re-uploading would send the whole file again for nothing. Full
      // confirmed bytes are not enough: the last part can land and the
      // Complete request still fail.
      patchTransfer(transferId, { error: undefined, phase: "finalizing" });
      runFork(finish(uppy, file.id, transferId));
      return;
    }
    if (completeSigned.has(transferId)) {
      // The Complete response may be the only thing that was lost; settle the
      // key first. NotUploaded means parts are genuinely missing, so transport
      // resumes: Uppy lists parts and Completes again.
      patchTransfer(transferId, { error: undefined, phase: "finalizing" });
      runFork(
        api.FinalizeTransfer({ transferId }).pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.sync(() => {
                if (error._tag === "NotUploaded") {
                  patchTransfer(transferId, { phase: "uploading" });
                  runFork(start(uppy, file.id, transferId));
                } else {
                  patchTransfer(transferId, { error, phase: "failed" });
                }
              }),
            onSuccess: () => settled(uppy, file.id, transferId),
          }),
        ),
      );
      return;
    }
    patchTransfer(transferId, { error: undefined, phase: "uploading" });
    runFork(start(uppy, file.id, transferId));
  });

  const cancel = Effect.fn("Uploads.cancel")(function* cancel(deliveryId: DeliveryId) {
    const uppy = yield* engine;
    const cancelled = yield* api.CancelDelivery({ deliveryId });
    for (const file of uppy.getFiles()) {
      if (file.meta.deliveryId === deliveryId) {
        uppy.removeFile(file.id);
      }
    }
    // Removed files fire no terminal event, so their progress would stay
    // active and keep beforeunload armed.
    for (const transfer of cancelled.transfers) {
      keys.delete(transfer.objectKey);
      completeSigned.delete(transfer.id);
      autoRetries.delete(transfer.id);
      patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
    }
    yield* forget(cancelled.transfers.map((transfer) => transfer.id));
    return cancelled;
  });

  // R2 drops incomplete multipart uploads after 7 days; a record that old
  // whose delivery no longer lists is only clutter.
  const RECORD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Rebuilds local progress for deliveries this tab doesn't own. A transfer
   * the server still sees as uploading becomes needsFile: the bytes are
   * there, but the resume needs the file picked again. Finalizing gets one
   * finalize attempt; any failure also lands on needsFile, since only a
   * reselected file can push the missing parts.
   */
  const restore = Effect.fn("Uploads.restore")(function* restore(deliveries: readonly Delivery[]) {
    const records = yield* readAll();
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
      if (transfers[transfer.id] !== undefined) {
        continue;
      }
      if (transfer.state === "complete" || transfer.state === "cancelled") {
        forgotten.push(transfer.id);
      } else if (transfer.state === "finalizing") {
        patchTransfer(transfer.id, { confirmed: record.confirmed, phase: "finalizing" });
        runFork(
          retryWhileNotUploaded(api.FinalizeTransfer({ transferId: transfer.id })).pipe(
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
  const resume = Effect.fn("Uploads.resume")(function* resume(
    delivery: Delivery,
    files: readonly File[],
  ) {
    const uppy = yield* engine;
    const records = yield* readAll();
    const recordOf = new Map(records.map((record) => [record.transferId, record]));
    const candidates = delivery.transfers.filter(
      (transfer) => transfers[transfer.id]?.phase === "needsFile" && recordOf.has(transfer.id),
    );
    const claimed = new Set<TransferId>();
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
            Number(recordOf.get(b.id)?.path === picked) -
            Number(recordOf.get(a.id)?.path === picked),
        );
      let first: "changed" | "gone" | "policy" | "unreadable" | undefined;
      let matched: { record: RecoveryRecord; transfer: Transfer } | undefined;
      for (const candidate of matching) {
        const record = recordOf.get(candidate.id);
        if (record === undefined) {
          continue;
        }
        let problem: "changed" | "gone" | "policy" | "unreadable" | undefined;
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
          const remote = yield* listRemoteParts(candidate.objectKey, record.uploadId);
          problem =
            remote === "gone"
              ? "gone"
              : yield* verifyParts(file, remote, record.partSize).pipe(
                  Effect.map((ok) => (ok ? undefined : ("changed" as const))),
                  Effect.catch(() => Effect.succeed("unreadable" as const)),
                );
        }
        if (problem === undefined) {
          matched = { record, transfer: candidate };
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
      const { record, transfer } = matched;
      claimed.add(transfer.id);
      keys.set(transfer.objectKey, transfer.id);
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
      patchTransfer(transfer.id, { error: undefined, phase: "queued" });
      runFork(start(uppy, fileId, transfer.id));
    }
    return problems;
  });

  return { cancel, restore, resume, retry, send };
});

export class Uploads extends Context.Service<Uploads, Effect.Success<typeof make>>()(
  "tranzfer/Uploads",
) {
  static readonly layer = Layer.effect(Uploads, make);
}

export { getDroppedFiles } from "@uppy/core/utils";

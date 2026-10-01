import type { AwsS3Options } from "@uppy/aws-s3";
import AwsS3 from "@uppy/aws-s3";
import { Uppy } from "@uppy/core";
import type { Body, Meta } from "@uppy/core/utils";
import { DeliveryId, partSize, RelativePath, TransferId } from "@tranzfer/contracts";
import type { RetentionDays, UploadRequest } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { ApiClient } from "../api/client";
import { fingerprint, forget, recordConfirmed, recordUploadId, remember } from "./recovery";
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
  // objectKey -> transferId, for every file this tab sent. Signing hands us
  // keys, so this is how a signed request finds its record.
  const keys = new Map<string, TransferId>();
  // transferId -> the uploadId already persisted; a new multipart upload for
  // the same transfer records again.
  const uploadIdStored = new Map<TransferId, string>();
  // Complete signed means the bytes may already be a finished object; an
  // error after this point reconciles instead of restarting transport.
  const completeSigned = new Set<TransferId>();

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
    const signed = yield* api.SignUpload({ key: request.key, request: upload });
    if (upload._tag === "Complete" && transferId !== undefined) {
      completeSigned.add(transferId);
    }
    // The headers are part of the signature (an empty file's PUT carries
    // if-none-match), so Uppy must send them as given.
    return { headers: signed.headers, url: signed.url };
  });

  // The uploader has already detached from this file by the time finish
  // settles, so removing it frees memory without firing an abort.
  const settled = (uppy: Uppy<TransferMeta, Body>, fileId: string, transferId: TransferId) =>
    Effect.gen(function* settle() {
      patchTransfer(transferId, { bytesPerSecond: 0, phase: "done" });
      completeSigned.delete(transferId);
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
    return yield* retryWhileNotUploaded(api.FinalizeTransfer({ transferId })).pipe(
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
      patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
    }
    yield* forget(cancelled.transfers.map((transfer) => transfer.id));
    return cancelled;
  });

  return { cancel, retry, send };
});

export class Uploads extends Context.Service<Uploads, Effect.Success<typeof make>>()(
  "tranzfer/Uploads",
) {
  static readonly layer = Layer.effect(Uploads, make);
}

export { getDroppedFiles } from "@uppy/core/utils";

import AwsS3 from "@uppy/aws-s3";
import { Uppy } from "@uppy/core";
import type { Body } from "@uppy/core/utils";
import { checkFiles, DeliveryId, isSinglePut, partSize, TransferId } from "@tranzfer/contracts";
import type { Delivery, LinkToken, NewFile, RetentionDays } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import { ApiClient } from "../api/client";
import { MAX_TRANSPORT_RETRIES, RETRY_CAP, retryTransport, untilOnline } from "../api/retry";
import { deliveryTitle } from "./files";
import type { ChosenFile } from "./files";
import { fingerprint, forget, recordConfirmed, recordUploadId, remember } from "./recovery";
import type { RecoveryRecord } from "./recovery";
import { ledger } from "./ledger";
import { recoverRequest, restore, resume } from "./resume";
import { UploadSpans } from "./spans";
import { patchTransfer, transfers, wireWindow } from "./store";
import { claim, letGo } from "./tabs";
import {
  finalizeFor,
  isTransientUploadError,
  partBytes,
  putAlreadyLanded,
  retryWhileNotUploaded,
  s3Error,
  signFor,
  start,
  toUploadRequest,
  uploadFailed,
} from "./transport";
import type { PresignableRequest, TransferMeta } from "./transport";

// Speed counts only parts R2 acknowledged, over about the last half minute.
// Socket progress runs ahead of the server (the OS buffers a burst at the
// start), so it never feeds speed or time left.
const SPEED_WINDOW_MS = 30_000;
// R2's S3 endpoint is HTTP/1.1, so Chromium opens at most 6 connections to
// it, and each part stream tops out near 18 MiB/s. Six parts fill those
// connections: 92 MiB/s against 62 at four (bench/upload, 10 GiB on staging).
// A second big file's parts wait a few seconds for a free connection.
const PART_CONCURRENCY = 6;

const make = Effect.gen(function* makeUploads() {
  const api = yield* ApiClient;
  const spans = yield* UploadSpans;
  // Background work (finalize, per-file starts) runs in fibers owned by this
  // layer, so it belongs to the app runtime rather than to a component.
  const runFork = yield* FiberSet.makeRuntime();
  const runPromise = yield* FiberSet.makeRuntimePromise();

  // The rate from the newest sample at least a window old (or the start, early
  // on) to this acknowledgement.
  const ackedSpeed = (samples: { at: number; confirmed: number }[], confirmed: number) => {
    const now = Date.now();
    samples.push({ at: now, confirmed });
    while (samples.length > 2 && now - (samples[1]?.at ?? now) >= SPEED_WINDOW_MS) {
      samples.shift();
    }
    const [base] = samples;
    return base === undefined || now === base.at
      ? 0
      : ((confirmed - base.confirmed) / (now - base.at)) * 1000;
  };

  const sign = Effect.fn("Uploads.sign")(function* sign(request: PresignableRequest) {
    const upload = toUploadRequest(request);
    if (upload === null) {
      return yield* Effect.die(new Error(`Tranzfer never signs this ${request.method}`));
    }
    // The upload id first reaches the browser inside a signed URL; the record
    // has to hold it before that URL can be lost with the tab.
    const entry = ledger.byKey(request.key);
    if (entry !== undefined && "uploadId" in request && entry.uploadId !== request.uploadId) {
      entry.uploadId = request.uploadId;
      yield* recordUploadId(entry.transferId, request.uploadId);
    }
    const signed = yield* retryTransport(signFor(api, entry?.transferId, request.key, upload));
    if (Predicate.isTagged(upload, "Complete") && entry !== undefined) {
      entry.completeSigned = true;
      yield* spans.note(entry.transferId, "complete.signed");
    }
    // The headers are part of the signature (an empty file's PUT carries
    // if-none-match), so Uppy must send them as given.
    return { headers: signed.headers, url: signed.url };
  });

  // The uploader has already detached from this file by the time finish
  // settles, so removing it frees memory without firing an abort.
  const settled = (uppy: Uppy<TransferMeta, Body>, fileId: string, transferId: TransferId) =>
    Effect.gen(function* settle() {
      yield* spans.endFile(transferId, "done", {
        "upload.parts_confirmed": ledger.of(transferId)?.doneParts.size,
      });
      patchTransfer(transferId, { bytesPerSecond: 0, phase: "done" });
      ledger.forget(transferId);
      uppy.removeFile(fileId);
      yield* forget([transferId]);
      letGo(transferId);
    });

  // Once the bytes are in R2, finishing is the FinalizeTransfer retry loop.
  // Both the upload-success path and a post-upload retry go through this.
  const finishFile = Effect.fn("Uploads.finish")(function* finishFile(
    uppy: Uppy<TransferMeta, Body>,
    fileId: string,
    transferId: TransferId,
  ) {
    return yield* retryWhileNotUploaded(retryTransport(finalizeFor(api, transferId))).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.andThen(
            Effect.sync(() => {
              patchTransfer(transferId, { error, phase: "failed" });
            }),
            spans.endFile(transferId, "failed", { "error.tag": error._tag }),
          ),
        onSuccess: () => settled(uppy, fileId, transferId),
      }),
    );
  });
  const finish = (uppy: Uppy<TransferMeta, Body>, fileId: string, transferId: TransferId) =>
    spans.underFile(transferId)(finishFile(uppy, fileId, transferId));

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
        partConcurrency: PART_CONCURRENCY,
        // A file bigger than one part is multipart so finalize can seal its
        // key (see RELIABILITY.md). A smaller one is a single guarded PUT:
        // one sign and one request instead of three of each. A resumed file
        // that already has an upload id stays multipart, whatever its size.
        shouldUseMultipart: (file) => !isSinglePut(file.size ?? 0),
        // A part is signed once per 64 MiB or more, so a span (and a propagated
        // trace) per part would bury the file's own. The API still traces them.
        signRequest: async (request) =>
          await runPromise(
            toUploadRequest(request)?._tag === "Part"
              ? sign(request).pipe(
                  Effect.withTracerEnabled(false),
                  Effect.provideService(HttpClient.TracerPropagationEnabled, false),
                )
              : spans.underFile(ledger.byKey(request.key)?.transferId)(sign(request)),
          ),
      });

      uppy.on("s3-multipart:part-uploaded", (file, part) => {
        const entry = ledger.entry(file.meta.transferId, file.meta.objectKey);
        entry.doneParts.add(part.PartNumber);
        const confirmed = partBytes(entry.doneParts, file.size ?? 0);
        entry.autoRetries = 0;
        patchTransfer(file.meta.transferId, {
          bytesPerSecond: ackedSpeed(entry.acks, confirmed),
          confirmed,
          phase: "uploading",
        });
        runFork(recordConfirmed(file.meta.transferId, confirmed));
      });

      uppy.on("upload-progress", (file, progress) => {
        if (file === undefined) {
          return;
        }
        const { objectKey, transferId } = file.meta;
        const confirmed = transfers[transferId]?.confirmed ?? 0;
        const entry = ledger.entry(transferId, objectKey);
        // The first bytes on the wire start the speed window.
        if (entry.acks.length === 0) {
          entry.acks.push({ at: Date.now(), confirmed });
        }
        patchTransfer(transferId, {
          inFlight: Math.max(progress.bytesUploaded - confirmed, 0),
          phase: "uploading",
        });
      });

      uppy.on("upload-success", (file) => {
        if (file === undefined) {
          return;
        }
        const { objectKey, transferId } = file.meta;
        ledger.entry(transferId, objectKey).acks = [];
        patchTransfer(transferId, {
          bytesPerSecond: 0,
          confirmed: Math.max(file.size ?? 0, transfers[transferId]?.confirmed ?? 0),
          inFlight: 0,
          phase: "finalizing",
          uploaded: true,
        });
        runFork(
          Effect.andThen(spans.note(transferId, "uploaded"), finish(uppy, file.id, transferId)),
        );
      });

      uppy.on("upload-error", (file, error) => {
        if (file === undefined) {
          return;
        }
        const { objectKey, transferId } = file.meta;
        const entry = ledger.entry(transferId, objectKey);
        // A retry measures speed afresh from its own first bytes.
        entry.acks = [];
        // Complete was already signed, or the guarded PUT found its object, so
        // the object may exist; reconcile through FinalizeTransfer instead of
        // starting transport again.
        if (entry.completeSigned || putAlreadyLanded(error)) {
          patchTransfer(transferId, { bytesPerSecond: 0, inFlight: 0, phase: "finalizing" });
          runFork(finish(uppy, file.id, transferId));
          return;
        }
        const attempts = entry.autoRetries;
        if (isTransientUploadError(error, attempts) && attempts < MAX_TRANSPORT_RETRIES) {
          entry.autoRetries = attempts + 1;
          // Keep phase uploading: the board already shows the paused copy
          // while offline ("Connection lost…"). retryUpload resumes the same
          // multipart upload because Uppy keeps s3Multipart on error, so
          // ListParts skips stored parts (law 5). A 404 there surfaces as
          // non-transient and fails honestly on the next upload-error.
          patchTransfer(transferId, { bytesPerSecond: 0, inFlight: 0, phase: "uploading" });
          const delay = Duration.min(Duration.seconds(2 ** attempts), RETRY_CAP);
          const status = Schema.is(s3Error)(error) ? error.status : undefined;
          runFork(
            Effect.suspend(() =>
              navigator.onLine
                ? Effect.void
                : spans
                    .note(transferId, "paused.offline")
                    .pipe(
                      Effect.andThen(untilOnline),
                      Effect.andThen(spans.note(transferId, "resumed.online")),
                    ),
            ).pipe(
              Effect.andThen(
                spans.note(transferId, "retry", {
                  attempt: attempts + 1,
                  "delay.seconds": Duration.toSeconds(delay),
                  "error.status": status,
                }),
              ),
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
                    : start(spans, uppy, file.id, transferId);
                }),
              ),
            ),
          );
          return;
        }
        const failed = uploadFailed(Schema.is(s3Error)(error) ? error : {});
        patchTransfer(transferId, {
          bytesPerSecond: 0,
          error: failed,
          inFlight: 0,
          phase: "failed",
        });
        runFork(
          spans.endFile(transferId, "failed", {
            "error.status": failed.status,
            "error.tag": "UploadError",
          }),
        );
      });

      return uppy;
    }),
  );

  // Creates the delivery for picked files and starts them. `begin` is the API
  // call that makes the delivery: the owner's CreateDelivery, or an uploader's
  // CreateRequestUpload, whose `token` then signs and finalizes every file.
  const place = <D extends Pick<Delivery, "id" | "transfers">, E extends { readonly _tag: string }>(
    files: readonly ChosenFile[],
    begin: (draft: {
      readonly files: readonly NewFile[];
      readonly id: DeliveryId;
    }) => Effect.Effect<D, E>,
    attributes: Record<string, boolean | number>,
    token?: LinkToken,
  ) =>
    Effect.gen(function* placeDelivery() {
      // Nothing is created for files the API would refuse.
      yield* checkFiles(files);
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
      const draft = {
        files: prepared.map(({ file, path, transferId }) => ({
          contentType: file.type === "" ? null : file.type,
          id: transferId,
          lastModified: file.lastModified,
          path,
          size: file.size,
        })),
        id: deliveryId,
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
      const spanAttributes = {
        "delivery.file_count": files.length,
        "delivery.total_bytes": files.reduce((total, { file }) => total + file.size, 0),
        ...attributes,
      };
      yield* spans.beginDelivery(deliveryId, spanAttributes);
      // Uploads.delivery and Uploads.file export only when they end, so a tab
      // closed mid-upload takes them along. This one ends at once and stays.
      yield* Effect.void.pipe(
        Effect.withSpan("Uploads.start", {
          attributes: { ...spanAttributes, "delivery.id": deliveryId },
        }),
      );
      const delivery = yield* begin(draft).pipe(
        spans.underDelivery(deliveryId),
        Effect.retry({
          schedule: Schedule.exponential("1 second"),
          times: 5,
          while: Predicate.isTagged("RpcClientError"),
        }),
        // A conflict means these ids already belong to different content, and a
        // plan, request or rate refusal means no delivery was made. Either way
        // nothing from this attempt exists to resume; its records go. Only a
        // dropped connection leaves them, since that create may have landed.
        Effect.catchIf(Predicate.not(Predicate.isTagged("RpcClientError")), (error) =>
          Effect.andThen(forget(prepared.map(({ transferId }) => transferId)), Effect.fail(error)),
        ),
        Effect.tapError((error) => spans.abandon(deliveryId, error._tag)),
      );

      const byPath = new Map(delivery.transfers.map((transfer) => [transfer.path, transfer]));
      const added: { fileId: string; size: number; transferId: TransferId }[] = [];
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
          claim(transfer.id);
          ledger.entry(transfer.id, transfer.objectKey).token = token;
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
          added.push({ fileId, size: transfer.size, transferId: transfer.id });
        }
      }).pipe(
        Effect.catch((error) =>
          Effect.gen(function* dropQueued() {
            for (const { fileId } of added) {
              uppy.removeFile(fileId);
            }
            for (const transfer of delivery.transfers) {
              ledger.forget(transfer.id);
              patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
              letGo(transfer.id);
            }
            yield* forget(delivery.transfers.map((transfer) => transfer.id));
            yield* spans.abandon(delivery.id, "files could not be queued");
            // If this cancel fails too, the sweeper ends the open delivery. An
            // uploader has no account to cancel with; the owner or the sweeper does.
            if (token === undefined) {
              yield* Effect.ignore(api.CancelDelivery({ deliveryId: delivery.id }), { log: true });
            }
            return yield* Effect.die(error.cause);
          }),
        ),
      );
      if (added.length === 0) {
        yield* spans.abandon(delivery.id, "no file queued");
      }
      for (const { fileId, size, transferId } of added) {
        yield* spans.beginFile(delivery.id, { id: transferId, size }, false);
        runFork(start(spans, uppy, fileId, transferId));
      }
      return delivery;
    });

  const send = Effect.fn("Uploads.send")(function* send(
    files: readonly ChosenFile[],
    retentionDays: RetentionDays,
  ) {
    return yield* place(
      files,
      (draft) => api.CreateDelivery({ ...draft, retentionDays, title: deliveryTitle(files) }),
      { "delivery.retention_days": retentionDays },
    );
  });

  /** An uploader without an account sends into a file request; its token signs everything after. */
  const sendToRequest = Effect.fn("Uploads.sendToRequest")(function* sendToRequest(
    files: readonly ChosenFile[],
    via: { readonly email: string | null; readonly name: string; readonly token: LinkToken },
  ) {
    return yield* place(
      files,
      (draft) =>
        api.CreateRequestUpload({ ...draft, email: via.email, name: via.name, token: via.token }),
      { "request.upload": true },
      via.token,
    );
  });

  const retry = Effect.fn("Uploads.retry")(function* retry(transferId: TransferId) {
    const uppy = yield* engine;
    const file = uppy.getFiles().find((candidate) => candidate.meta.transferId === transferId);
    if (file === undefined) {
      return;
    }
    const entry = ledger.entry(transferId, file.meta.objectKey);
    entry.autoRetries = 0;
    yield* spans.beginFile(file.meta.deliveryId, { id: transferId, size: file.size ?? 0 }, true);
    if (transfers[transferId]?.uploaded) {
      // Uppy finished, so the object exists and only FinalizeTransfer failed;
      // re-uploading would send the whole file again for nothing. Full
      // confirmed bytes are not enough: the last part can land and the
      // Complete request still fail.
      patchTransfer(transferId, { error: undefined, phase: "finalizing" });
      runFork(finish(uppy, file.id, transferId));
      return;
    }
    if (entry.completeSigned) {
      // The Complete response may be the only thing that was lost; settle the
      // key first. NotUploaded means parts are genuinely missing, so transport
      // resumes: Uppy lists parts and Completes again.
      patchTransfer(transferId, { error: undefined, phase: "finalizing" });
      runFork(
        finalizeFor(api, transferId).pipe(
          spans.underFile(transferId),
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.suspend(() => {
                if (Predicate.isTagged(error, "NotUploaded")) {
                  patchTransfer(transferId, { phase: "uploading" });
                  runFork(start(spans, uppy, file.id, transferId));
                  return Effect.void;
                }
                patchTransfer(transferId, { error, phase: "failed" });
                return spans.endFile(transferId, "failed", { "error.tag": error._tag });
              }),
            onSuccess: () => settled(uppy, file.id, transferId),
          }),
        ),
      );
      return;
    }
    patchTransfer(transferId, { error: undefined, phase: "uploading" });
    runFork(start(spans, uppy, file.id, transferId));
  });

  const cancel = Effect.fn("Uploads.cancel")(function* cancel(deliveryId: DeliveryId) {
    const uppy = yield* engine;
    const cancelled = yield* api
      .CancelDelivery({ deliveryId })
      .pipe(spans.underDelivery(deliveryId));
    for (const file of uppy.getFiles()) {
      if (file.meta.deliveryId === deliveryId) {
        uppy.removeFile(file.id);
      }
    }
    // Removed files fire no terminal event, so their progress would stay
    // active and keep beforeunload armed.
    for (const transfer of cancelled.transfers) {
      ledger.forget(transfer.id);
      patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
      letGo(transfer.id);
      yield* spans.endFile(transfer.id, "cancelled");
    }
    yield* forget(cancelled.transfers.map((transfer) => transfer.id));
    return cancelled;
  });

  return {
    cancel,
    recoverRequest: (token: LinkToken, sentHere: readonly DeliveryId[]) =>
      recoverRequest(api, runFork, token, sentHere),
    restore: (deliveries: readonly Pick<Delivery, "transfers">[], token?: LinkToken) =>
      restore(api, runFork, deliveries, token),
    resume: (
      delivery: Pick<Delivery, "id" | "transfers">,
      files: readonly File[],
      onChecking?: (progress: { readonly checked: number; readonly total: number }) => void,
      token?: LinkToken,
    ) => resume(api, spans, runFork, engine, delivery, files, onChecking, token),
    retry,
    send,
    sendToRequest,
  };
});

export class Uploads extends Context.Service<Uploads, Effect.Success<typeof make>>()(
  "tranzfer/Uploads",
) {
  static readonly layer = Layer.effect(Uploads, make);
}

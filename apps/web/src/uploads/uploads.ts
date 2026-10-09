import type { AwsS3Options } from "@uppy/aws-s3";
import AwsS3 from "@uppy/aws-s3";
import { Uppy } from "@uppy/core";
import type { Body, Meta } from "@uppy/core/utils";
import {
  checkFiles,
  DeliveryId,
  isSinglePut,
  maxTitleLength,
  partSize,
  TransferId,
} from "@tranzfer/contracts";
import type {
  Delivery,
  NewFile,
  RetentionDays,
  SignedUrl,
  Transfer,
  UploadRequest,
} from "@tranzfer/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import { ApiClient } from "../api/client";
import type { ApiError } from "../api/errors";
import {
  fingerprint,
  forget,
  readAll,
  recordConfirmed,
  recordUploadId,
  remember,
} from "./recovery";
import type { RecoveryRecord } from "./recovery";
import { makeUploadSpans } from "./spans";
import { patchTransfer, transfers, wireWindow } from "./store";
import { claim, letGo, sendingElsewhere } from "./tabs";
import type { ListedPart, VerifyReply, VerifyRequest } from "./verify";

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

// Speed counts only parts R2 acknowledged, over about the last half minute.
// Socket progress runs ahead of the server (the OS buffers a burst at the
// start), so it never feeds speed or time left.
const SPEED_WINDOW_MS = 30_000;
// R2's S3 endpoint is HTTP/1.1, so Chromium opens at most 6 connections to
// it; one part stream tops out near 20 MB/s. Four parts at once is rclone's
// default and leaves room for a second file.
const PART_CONCURRENCY = 4;
// RequestUploads reads this many delivery ids at a time.
const MAX_RECOVERED = 50;

/** Bytes of the given parts; only the last part is short. */
const partBytes = (parts: ReadonlySet<number>, size: number) => {
  const each = partSize(size);
  let total = 0;
  for (const partNumber of parts) {
    total += Math.max(Math.min(each, size - (partNumber - 1) * each), 0);
  }
  return total;
};
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

// A name can be longer than a title may be, so the title is cut to fit. A cut
// through a surrogate pair would leave half a character, so the half goes too.
const fitTitle = (title: string) =>
  title.length <= maxTitleLength
    ? title
    : `${title.slice(0, maxTitleLength - 1).replace(/[\uD800-\uDBFF]$/u, "")}…`;

export const deliveryTitle = (files: readonly ChosenFile[]) => {
  const [first] = files;
  if (first === undefined) {
    return "Delivery";
  }
  const [top] = first.path.split("/");
  if (files.length > 1 && files.every(({ path }) => path.startsWith(`${top}/`))) {
    return fitTitle(top ?? "Delivery");
  }
  if (files.length === 1) {
    return fitTitle(first.file.name);
  }
  return fitTitle(`${first.file.name} and ${files.length - 1} more`);
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

// Transport failures retry, and so does a signing rate limit, which clears
// within its window; other typed refusals (UploadClosed, InvalidUpload,
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
      while: (error) => error._tag === "RpcClientError" || error._tag === "RateLimited",
    }),
  );

// Uppy's S3 errors aren't exported, and their names don't survive
// minification (S3Error sets name from new.target), so match on fields:
// S3NetworkError carries code "NETWORK", S3ServiceError a numeric status.
// Network loss, an expired signature (403, law 6), timeouts, throttling and
// 5xx come back on their own; 404 is the multipart upload gone, which must
// never restart silently.
const s3Error = Schema.Struct({
  // A service error copies x-amz-error-code here, which can be null.
  code: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Number),
});

export const isTransientUploadError = (error: Error) => {
  if (!Schema.is(s3Error)(error)) {
    return false;
  }
  if (error.status === undefined) {
    return error.code === "NETWORK";
  }
  return (
    error.status === 403 || error.status === 408 || error.status === 429 || error.status >= 500
  );
};

// A single PUT is signed with If-None-Match: *, so 412 means the object is
// already there: an earlier PUT landed and its response was lost, or the tab
// died after it. That reconciles through FinalizeTransfer like a lost Complete.
export const putAlreadyLanded = (error: Error) => Schema.is(s3Error)(error) && error.status === 412;

const basename = (path: string) => path.split("/").pop() ?? path;

// The pick waits on this hashing, and it can run for minutes, so it lives in a
// worker: on the page thread each 64 MiB part was a ~120 ms long task. Worker
// events are the adapter edge; a read or hash failure becomes UnknownError and
// the caller reports the file as unreadable.
export const verifyInWorker = (
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

const make = Effect.gen(function* makeUploads() {
  const api = yield* ApiClient;
  const spans = yield* makeUploadSpans;
  // Background work (finalize, per-file starts) runs in fibers owned by this
  // layer, so it belongs to the app runtime rather than to a component.
  const runFork = yield* FiberSet.makeRuntime();
  const runPromise = yield* FiberSet.makeRuntimePromise();
  // transferId -> acknowledged bytes over time, oldest first, since the
  // transfer last started moving in this tab.
  const acks = new Map<TransferId, { at: number; confirmed: number }[]>();
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
  // transferId -> the file request's token, for transfers an uploader without
  // an account sends. Their calls go to the token-bound RPCs.
  const requestTokens = new Map<TransferId, string>();
  // transferId -> part numbers R2 holds. Parts finish out of order, so
  // confirmed bytes come from this set, seeded from ListParts on resume.
  const doneParts = new Map<TransferId, Set<number>>();

  // The rate from the newest sample at least a window old (or the start, early
  // on) to this acknowledgement.
  const ackedSpeed = (transferId: TransferId, confirmed: number) => {
    const now = Date.now();
    const samples = acks.get(transferId) ?? [];
    samples.push({ at: now, confirmed });
    while (samples.length > 2 && now - (samples[1]?.at ?? now) >= SPEED_WINDOW_MS) {
      samples.shift();
    }
    acks.set(transferId, samples);
    const [base] = samples;
    return base === undefined || now === base.at
      ? 0
      : ((confirmed - base.confirmed) / (now - base.at)) * 1000;
  };

  // retryUpload, not upload(): upload() would first re-run every failed file
  // in Uppy, other deliveries' included, so each file starts on its own.
  // Per-file errors flow through upload-error; a rejection here is a
  // pre-flight failure no event covers. Interrupting this fiber does not
  // abort the upload: the promise has no signal.
  const start = (uppy: Uppy<TransferMeta, Body>, fileId: string, transferId: TransferId) =>
    Effect.tryPromise(async () => await uppy.retryUpload(fileId)).pipe(
      Effect.catch((error) =>
        Effect.andThen(
          Effect.sync(() => {
            patchTransfer(transferId, { bytesPerSecond: 0, error: error.cause, phase: "failed" });
          }),
          spans.endFile(transferId, "failed", { "error.tag": "StartFailed" }),
        ),
      ),
    );

  // An owner's transfer signs and finalizes as the owner; an uploader's, as
  // the request's token.
  const signFor = (transferId: TransferId | undefined, key: string, request: UploadRequest) =>
    Effect.suspend((): Effect.Effect<SignedUrl, ApiError> => {
      const token = transferId === undefined ? undefined : requestTokens.get(transferId);
      return token === undefined
        ? api.SignUpload({ key, request })
        : api.SignRequestUpload({ key, request, token });
    });
  const finalizeFor = (transferId: TransferId) =>
    Effect.suspend((): Effect.Effect<Pick<Delivery, "id" | "status" | "transfers">, ApiError> => {
      const token = requestTokens.get(transferId);
      return token === undefined
        ? api.FinalizeTransfer({ transferId })
        : api.FinalizeRequestTransfer({ token, transferId });
    });

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
    const signed = yield* retryTransport(signFor(transferId, request.key, upload));
    if (upload._tag === "Complete" && transferId !== undefined) {
      completeSigned.add(transferId);
      yield* spans.note(transferId, "complete.signed");
    }
    // The headers are part of the signature (an empty file's PUT carries
    // if-none-match), so Uppy must send them as given.
    return { headers: signed.headers, url: signed.url };
  });

  // Lists the parts R2 holds for an upload id, following every page. "gone"
  // means the multipart upload itself vanished (404 or NoSuchUpload), and no
  // resume may start a new one in its place.
  const listRemoteParts = Effect.fn("Uploads.listRemoteParts")(function* listRemoteParts(
    transferId: TransferId,
    objectKey: string,
    uploadId: string,
  ) {
    const parts: ListedPart[] = [];
    let marker: number | undefined;
    for (;;) {
      const signed = yield* retryTransport(
        signFor(
          transferId,
          objectKey,
          marker === undefined
            ? { _tag: "List", uploadId }
            : { _tag: "List", partNumberMarker: marker, uploadId },
        ),
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
      yield* spans.endFile(transferId, "done", {
        "upload.parts_confirmed": doneParts.get(transferId)?.size,
      });
      patchTransfer(transferId, { bytesPerSecond: 0, phase: "done" });
      completeSigned.delete(transferId);
      autoRetries.delete(transferId);
      doneParts.delete(transferId);
      requestTokens.delete(transferId);
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
    return yield* retryWhileNotUploaded(retryTransport(finalizeFor(transferId))).pipe(
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
              : spans.underFile(keys.get(request.key))(sign(request)),
          ),
      });

      uppy.on("s3-multipart:part-uploaded", (file, part) => {
        const done = doneParts.get(file.meta.transferId) ?? new Set<number>();
        doneParts.set(file.meta.transferId, done.add(part.PartNumber));
        const confirmed = partBytes(done, file.size ?? 0);
        autoRetries.delete(file.meta.transferId);
        patchTransfer(file.meta.transferId, {
          bytesPerSecond: ackedSpeed(file.meta.transferId, confirmed),
          confirmed,
          phase: "uploading",
        });
        runFork(recordConfirmed(file.meta.transferId, confirmed));
      });

      uppy.on("upload-progress", (file, progress) => {
        if (file === undefined) {
          return;
        }
        const { transferId } = file.meta;
        const confirmed = transfers[transferId]?.confirmed ?? 0;
        // The first bytes on the wire start the speed window.
        if (!acks.has(transferId)) {
          acks.set(transferId, [{ at: Date.now(), confirmed }]);
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
        const { transferId } = file.meta;
        acks.delete(transferId);
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
        const { transferId } = file.meta;
        // A retry measures speed afresh from its own first bytes.
        acks.delete(transferId);
        // Complete was already signed, or the guarded PUT found its object, so
        // the object may exist; reconcile through FinalizeTransfer instead of
        // starting transport again.
        if (completeSigned.has(transferId) || putAlreadyLanded(error)) {
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
        runFork(
          spans.endFile(transferId, "failed", {
            "error.status": Schema.is(s3Error)(error) ? error.status : undefined,
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
    token?: string,
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
      yield* spans.beginDelivery(deliveryId, {
        "delivery.file_count": files.length,
        "delivery.total_bytes": files.reduce((total, { file }) => total + file.size, 0),
        ...attributes,
      });
      const delivery = yield* begin(draft).pipe(
        spans.underDelivery(deliveryId),
        Effect.retry({
          schedule: Schedule.exponential("1 second"),
          times: 5,
          while: (error) => error._tag === "RpcClientError",
        }),
        // A conflict means these ids already belong to different content, and a
        // plan, request or rate refusal means no delivery was made. Either way
        // nothing from this attempt exists to resume; its records go. Only a
        // dropped connection leaves them, since that create may have landed.
        Effect.catchIf(
          (error) => error._tag !== "RpcClientError",
          (error) =>
            Effect.andThen(
              forget(prepared.map(({ transferId }) => transferId)),
              Effect.fail(error),
            ),
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
          keys.set(transfer.objectKey, transfer.id);
          if (token !== undefined) {
            requestTokens.set(transfer.id, token);
          }
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
              keys.delete(transfer.objectKey);
              completeSigned.delete(transfer.id);
              autoRetries.delete(transfer.id);
              requestTokens.delete(transfer.id);
              patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
              letGo(transfer.id);
            }
            yield* forget(delivery.transfers.map((transfer) => transfer.id));
            yield* spans.abandon(delivery.id, "files could not be queued");
            // If this cancel fails too, the sweeper ends the open delivery. An
            // uploader has no account to cancel with; the owner or the sweeper does.
            if (token === undefined) {
              yield* Effect.ignore(api.CancelDelivery({ deliveryId: delivery.id }));
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
        runFork(start(uppy, fileId, transferId));
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
    via: { readonly email: string | null; readonly name: string; readonly token: string },
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
    if (completeSigned.has(transferId)) {
      // The Complete response may be the only thing that was lost; settle the
      // key first. NotUploaded means parts are genuinely missing, so transport
      // resumes: Uppy lists parts and Completes again.
      patchTransfer(transferId, { error: undefined, phase: "finalizing" });
      runFork(
        finalizeFor(transferId).pipe(
          spans.underFile(transferId),
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.suspend(() => {
                if (error._tag === "NotUploaded") {
                  patchTransfer(transferId, { phase: "uploading" });
                  runFork(start(uppy, file.id, transferId));
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
    runFork(start(uppy, file.id, transferId));
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
      keys.delete(transfer.objectKey);
      completeSigned.delete(transfer.id);
      autoRetries.delete(transfer.id);
      patchTransfer(transfer.id, { bytesPerSecond: 0, inFlight: 0, phase: "cancelled" });
      letGo(transfer.id);
      yield* spans.endFile(transfer.id, "cancelled");
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
   * reselected file can push the missing parts. One that another live tab
   * holds the lock for becomes elsewhere and is left to that tab.
   */
  const restore = Effect.fn("Uploads.restore")(function* restore(
    deliveries: readonly Pick<Delivery, "transfers">[],
    // The file request the deliveries came in through, for an uploader.
    token?: string,
  ) {
    const records = yield* readAll();
    const elsewhere = yield* sendingElsewhere();
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
        requestTokens.set(transfer.id, token);
      }
      if (transfer.state === "complete" || transfer.state === "cancelled") {
        forgotten.push(transfer.id);
      } else if (elsewhere.has(transfer.id)) {
        patchTransfer(transfer.id, { confirmed: record.confirmed, phase: "elsewhere" });
      } else if (transfer.state === "finalizing") {
        patchTransfer(transfer.id, { confirmed: record.confirmed, phase: "finalizing" });
        runFork(
          retryWhileNotUploaded(finalizeFor(transfer.id)).pipe(
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
    delivery: Pick<Delivery, "id" | "transfers">,
    files: readonly File[],
    // Bytes of stored parts hashed so far, out of those listed so far.
    onChecking?: (progress: { readonly checked: number; readonly total: number }) => void,
    // The file request the delivery came in through, for an uploader.
    token?: string,
  ) {
    const uppy = yield* engine;
    if (token !== undefined) {
      for (const transfer of delivery.transfers) {
        requestTokens.set(transfer.id, token);
      }
    }
    const records = yield* readAll();
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
            Number(recordOf.get(b.id)?.path === picked) -
            Number(recordOf.get(a.id)?.path === picked),
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
          const remote = yield* listRemoteParts(candidate.id, candidate.objectKey, record.uploadId);
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
      doneParts.set(transfer.id, done);
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
      runFork(start(uppy, fileId, transfer.id));
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
  const recoverRequest = Effect.fn("Uploads.recoverRequest")(function* recoverRequest(
    token: string,
    sentHere: readonly DeliveryId[],
  ) {
    const records = yield* readAll();
    const remembered = records
      .toSorted((a, b) => b.createdAt - a.createdAt)
      .map((record) => record.deliveryId);
    const ids = [...new Set([...sentHere, ...remembered])].slice(0, MAX_RECOVERED);
    const found =
      ids.length === 0
        ? []
        : yield* retryTransport(api.RequestUploads({ deliveryIds: ids, token }));
    yield* restore(found, token);
    return found;
  });

  return { cancel, recoverRequest, restore, resume, retry, send, sendToRequest };
});

export class Uploads extends Context.Service<Uploads, Effect.Success<typeof make>>()(
  "tranzfer/Uploads",
) {
  static readonly layer = Layer.effect(Uploads, make);
}

export { getDroppedFiles } from "@uppy/core/utils";

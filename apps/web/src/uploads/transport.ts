import type { AwsS3Options } from "@uppy/aws-s3";
import type { Uppy } from "@uppy/core";
import type { Body, Meta } from "@uppy/core/utils";
import { partSize, UploadRequest } from "@tranzfer/contracts";
import type { Delivery, DeliveryId, SignedUrl, TransferId } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import type { ApiClient } from "../api/client";
import type { ApiError } from "../api/errors";
import { retryTransport } from "../api/retry";
import { UploadFailed } from "./failure";
import { ledger } from "./ledger";
import type { UploadSpans } from "./spans";
import { patchTransfer } from "./store";
import type { ListedPart } from "./verify";

// How a transfer's requests reach R2: what Uppy asks to sign, which failures
// come back on their own, and the API calls that sign, list and finalize.

type SignRequest = Extract<
  AwsS3Options<TransferMeta, Body>,
  { signRequest: unknown }
>["signRequest"];
export type PresignableRequest = Parameters<SignRequest>[0];

export interface TransferMeta extends Meta {
  readonly deliveryId: DeliveryId;
  readonly objectKey: string;
  // Uppy derives file ids from relativePath and rejects duplicates, so the
  // path alone would refuse the same file in a second delivery.
  readonly relativePath: string;
  readonly transferId: TransferId;
}

/** Bytes of the given parts; only the last part is short. */
export const partBytes = (parts: ReadonlySet<number>, size: number) => {
  const each = partSize(size);
  let total = 0;
  for (const partNumber of parts) {
    total += Math.max(Math.min(each, size - (partNumber - 1) * each), 0);
  }
  return total;
};

// Aborts are never signed: cancel is a server-side operation, and signing
// one would be a bug. A PUT without an upload id is an empty file: Uppy
// sends only those as a single request.
export const toUploadRequest = (request: PresignableRequest): UploadRequest | null => {
  if (!("uploadId" in request)) {
    if (request.method === "POST") {
      return UploadRequest.cases.Create.make({});
    }
    return request.method === "PUT" ? UploadRequest.cases.Put.make({}) : null;
  }
  if (request.method === "PUT") {
    return UploadRequest.cases.Part.make({
      partNumber: request.partNumber,
      uploadId: request.uploadId,
    });
  }
  if (request.method === "GET") {
    return UploadRequest.cases.List.make({
      partNumberMarker: request.partNumberMarker,
      uploadId: request.uploadId,
    });
  }
  if (request.method === "POST") {
    return UploadRequest.cases.Complete.make({ uploadId: request.uploadId });
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
      while: Predicate.isTagged("NotUploaded"),
    }),
  );

// Uppy's S3 errors aren't exported, and their names don't survive
// minification (S3Error sets name from new.target), so match on fields:
// S3NetworkError carries code "NETWORK", S3ServiceError a numeric status.
// Network loss, an expired signature (403, law 6), timeouts, throttling and
// 5xx come back on their own; 404 is the multipart upload gone, which must
// never restart silently. Every retry signs afresh, so a 403 that survives
// one fresh signature is a refusal (a body longer or shorter than the signed
// length) and fails at once instead of retrying 40 times.
export const s3Error = Schema.Struct({
  // A service error copies x-amz-error-code here, which can be null.
  code: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.Number),
});

export const isTransientUploadError = (error: Error, attempts: number) => {
  if (!Schema.is(s3Error)(error)) {
    return false;
  }
  if (error.status === undefined) {
    return error.code === "NETWORK";
  }
  if (error.status === 403) {
    return attempts === 0;
  }
  return error.status === 408 || error.status === 429 || error.status >= 500;
};

// What the row says about a failure isTransientUploadError gave up on. Only a
// status-less error can be the connection, as above.
export const uploadFailed = ({ code, status }: typeof s3Error.Type) => {
  if (status === 404) {
    return new UploadFailed({ reason: "gone", status });
  }
  if (status === 403) {
    return new UploadFailed({ reason: "denied", status });
  }
  return new UploadFailed({
    reason: status === undefined && code === "NETWORK" ? "network" : "unknown",
    status,
  });
};

// A single PUT is signed with If-None-Match: *, so 412 means the object is
// already there: an earlier PUT landed and its response was lost, or the tab
// died after it. That reconciles through FinalizeTransfer like a lost Complete.
export const putAlreadyLanded = (error: Error) => Schema.is(s3Error)(error) && error.status === 412;

// retryUpload, not upload(): upload() would first re-run every failed file
// in Uppy, other deliveries' included, so each file starts on its own.
// Per-file errors flow through upload-error; a rejection here is a
// pre-flight failure no event covers. Interrupting this fiber does not
// abort the upload: the promise has no signal.
export const start = (
  spans: UploadSpans["Service"],
  uppy: Uppy<TransferMeta, Body>,
  fileId: string,
  transferId: TransferId,
) =>
  Effect.tryPromise(async () => await uppy.retryUpload(fileId)).pipe(
    Effect.catch(() =>
      Effect.andThen(
        Effect.sync(() => {
          patchTransfer(transferId, {
            bytesPerSecond: 0,
            error: uploadFailed({}),
            phase: "failed",
          });
        }),
        spans.endFile(transferId, "failed", { "error.tag": "StartFailed" }),
      ),
    ),
  );

// An owner's transfer signs and finalizes as the owner; an uploader's, as
// the request's token.
export const signFor = (
  api: ApiClient["Service"],
  transferId: TransferId | undefined,
  key: string,
  request: UploadRequest,
) =>
  Effect.suspend((): Effect.Effect<SignedUrl, ApiError> => {
    const token = transferId === undefined ? undefined : ledger.of(transferId)?.token;
    return token === undefined
      ? api.SignUpload({ key, request })
      : api.SignRequestUpload({ key, request, token });
  });
export const finalizeFor = (api: ApiClient["Service"], transferId: TransferId) =>
  Effect.suspend((): Effect.Effect<Pick<Delivery, "id" | "status" | "transfers">, ApiError> => {
    const token = ledger.of(transferId)?.token;
    return token === undefined
      ? api.FinalizeTransfer({ transferId })
      : api.FinalizeRequestTransfer({ token, transferId });
  });

// Lists the parts R2 holds for an upload id, following every page. "gone"
// means the multipart upload itself vanished (404 or NoSuchUpload), and no
// resume may start a new one in its place.
export const listRemoteParts = Effect.fn("Uploads.listRemoteParts")(function* listRemoteParts(
  api: ApiClient["Service"],
  transferId: TransferId,
  objectKey: string,
  uploadId: string,
) {
  const parts: ListedPart[] = [];
  let marker: number | undefined;
  for (;;) {
    const signed = yield* retryTransport(
      signFor(
        api,
        transferId,
        objectKey,
        UploadRequest.cases.List.make({ partNumberMarker: marker, uploadId }),
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
      return yield* uploadFailed({ status: response.status });
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

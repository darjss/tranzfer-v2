import * as Schema from "effect/Schema";

const MIB = 1024 * 1024;
const MAX_PARTS = 10_000;

// 64 MiB stands until the 10 GB gate benchmark.
export const partSize = (size: number) =>
  Math.max(64 * MIB, Math.ceil(size / MAX_PARTS / MIB) * MIB);
// An empty file still uploads one (empty) part.
export const partCount = (size: number) => Math.max(1, Math.ceil(size / partSize(size)));

/**
 * The S3 requests Uppy asks the API to sign. Every file is a multipart upload,
 * so finalize can close the key: a completed or aborted upload id accepts no
 * more writes, and there is no single-PUT URL to replay. Aborts are not here:
 * cancel is server-side.
 */
export const UploadRequest = Schema.Union([
  Schema.TaggedStruct("Create", {}),
  Schema.TaggedStruct("Part", {
    partNumber: Schema.Int.check(Schema.isBetween({ maximum: MAX_PARTS, minimum: 1 })),
    uploadId: Schema.String,
  }),
  Schema.TaggedStruct("List", { uploadId: Schema.String }),
  Schema.TaggedStruct("Complete", { uploadId: Schema.String }),
]);
export type UploadRequest = typeof UploadRequest.Type;

/** Uppy signs by object key; the server resolves the transfer from it. */
export const SignUploadPayload = Schema.Struct({ key: Schema.String, request: UploadRequest });
export interface SignUploadPayload extends Schema.Schema.Type<typeof SignUploadPayload> {}

export const SignedUrl = Schema.Struct({ expiresAt: Schema.DateFromString, url: Schema.String });
export interface SignedUrl extends Schema.Schema.Type<typeof SignedUrl> {}

/** The request or the stored object does not fit the transfer. */
export class InvalidUpload extends Schema.TaggedError<InvalidUpload>()("InvalidUpload", {}) {}

/** The object is not visible in storage yet; finalize can be retried. */
export class NotUploaded extends Schema.TaggedError<NotUploaded>()("NotUploaded", {}) {}

/** The transfer or its delivery was cancelled or has finished. */
export class UploadClosed extends Schema.TaggedError<UploadClosed>()("UploadClosed", {}) {}

/** Object storage failed; the call is safe to retry. */
export class StorageUnavailable extends Schema.TaggedError<StorageUnavailable>()(
  "StorageUnavailable",
  {},
) {}

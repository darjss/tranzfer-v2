import * as Schema from "effect/Schema";

const MIB = 1024 * 1024;
const MAX_PARTS = 10_000;

// 64 MiB stands until the 10 GB gate benchmark.
export const partSize = (size: number) =>
  Math.max(64 * MIB, Math.ceil(size / MAX_PARTS / MIB) * MIB);
export const partCount = (size: number) => Math.ceil(size / partSize(size));

/**
 * A file of one part or less is one guarded PUT. Its one part is as resumable
 * as that PUT is (a failure resends the whole file either way), and it saves
 * the Create and Complete round trips that dominate a folder of small files.
 */
export const isSinglePut = (size: number) => partCount(size) <= 1;

/**
 * The S3 requests Uppy asks the API to sign. A file bigger than one part is a
 * multipart upload, so finalize can close the key: a completed or aborted
 * upload id accepts no more writes. A file of one part or less (see
 * `isSinglePut`) is a single `Put`, signed to only create the object, never
 * replace it. Aborts are not here: cancel is server-side.
 */
export const UploadRequest = Schema.Union([
  Schema.TaggedStruct("Put", {}),
  Schema.TaggedStruct("Create", {}),
  Schema.TaggedStruct("Part", {
    partNumber: Schema.Int.check(Schema.isBetween({ maximum: MAX_PARTS, minimum: 1 })),
    uploadId: Schema.String,
  }),
  Schema.TaggedStruct("List", {
    // ListParts pages at 1,000 parts; the marker continues to the next page.
    partNumberMarker: Schema.optional(
      Schema.Int.check(Schema.isBetween({ maximum: MAX_PARTS, minimum: 0 })),
    ),
    uploadId: Schema.String,
  }),
  Schema.TaggedStruct("Complete", { uploadId: Schema.String }),
]);
export type UploadRequest = typeof UploadRequest.Type;

/** Uppy signs by object key; the server resolves the transfer from it. */
export const SignUploadPayload = Schema.Struct({ key: Schema.String, request: UploadRequest });
export interface SignUploadPayload extends Schema.Schema.Type<typeof SignUploadPayload> {}

/** The same, from an uploader with no account: the request's token is the credential. */
export const SignRequestUploadPayload = Schema.Struct({
  ...SignUploadPayload.fields,
  token: Schema.String,
});

/** `headers` are part of the signature; the request must send them as given. */
export const SignedUrl = Schema.Struct({
  expiresAt: Schema.DateFromString,
  headers: Schema.Record(Schema.String, Schema.String),
  url: Schema.String,
});
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

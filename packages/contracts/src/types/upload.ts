import * as Schema from "effect/Schema";

// The S3 requests Uppy asks the API to sign. There is no abort variant:
// cancellation is a server-side operation, never a signed request.
const UploadRequestSchema = Schema.Union([
  Schema.TaggedStruct("Put", {}),
  Schema.TaggedStruct("Create", {}),
  Schema.TaggedStruct("Part", {
    partNumber: Schema.Int.check(Schema.isBetween({ maximum: 10_000, minimum: 1 })),
    uploadId: Schema.String,
  }),
  Schema.TaggedStruct("List", { uploadId: Schema.String }),
  Schema.TaggedStruct("Complete", { uploadId: Schema.String }),
]);

export { UploadRequestSchema as UploadRequest };
export type UploadRequest = typeof UploadRequestSchema.Type;

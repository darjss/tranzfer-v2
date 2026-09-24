import * as Schema from "effect/Schema";

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  cause: Schema.Unknown,
  op: Schema.Literals(["abortUploads", "head", "remove", "signDownload", "signUpload"]),
}) {}

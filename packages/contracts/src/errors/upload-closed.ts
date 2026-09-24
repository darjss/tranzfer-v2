import * as Schema from "effect/Schema";

export class UploadClosed extends Schema.TaggedError<UploadClosed>()("UploadClosed", {
  message: Schema.String,
}) {}

import * as Schema from "effect/Schema";

export class InvalidUpload extends Schema.TaggedError<InvalidUpload>()("InvalidUpload", {
  message: Schema.String,
}) {}

import * as Schema from "effect/Schema";

export class NotUploaded extends Schema.TaggedError<NotUploaded>()("NotUploaded", {
  message: Schema.String,
}) {}

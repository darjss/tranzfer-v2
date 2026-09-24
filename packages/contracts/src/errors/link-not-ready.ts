import * as Schema from "effect/Schema";

export class LinkNotReady extends Schema.TaggedError<LinkNotReady>()("LinkNotReady", {
  message: Schema.String,
  senderName: Schema.String,
  title: Schema.String,
}) {}

import * as Schema from "effect/Schema";

export class LinkNotFound extends Schema.TaggedError<LinkNotFound>()("LinkNotFound", {
  message: Schema.String,
}) {}

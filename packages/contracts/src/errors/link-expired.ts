import * as Schema from "effect/Schema";

export class LinkExpired extends Schema.TaggedError<LinkExpired>()("LinkExpired", {
  expiredAt: Schema.DateFromString,
  message: Schema.String,
  title: Schema.String,
}) {}

import * as Schema from "effect/Schema";

export class DrizzleError extends Schema.TaggedError<DrizzleError>()("DrizzleError", {
  cause: Schema.Unknown,
  op: Schema.String,
}) {}

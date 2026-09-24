import * as Schema from "effect/Schema";

export class ProbeFailed extends Schema.TaggedError<ProbeFailed>()("ProbeFailed", {
  message: Schema.String,
  resource: Schema.Literals(["d1", "r2", "s3"]),
}) {}

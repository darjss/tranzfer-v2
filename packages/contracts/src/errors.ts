import * as Schema from "effect/Schema";

export class ProbeFailed extends Schema.TaggedError<ProbeFailed>()("ProbeFailed", {
  resource: Schema.Literals(["d1", "r2"]),
}) {}

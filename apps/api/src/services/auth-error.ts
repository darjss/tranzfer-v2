import * as Schema from "effect/Schema";

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  cause: Schema.Unknown,
  op: Schema.Literals(["session"]),
}) {}

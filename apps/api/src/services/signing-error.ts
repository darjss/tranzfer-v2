import * as Schema from "effect/Schema";

export class SigningError extends Schema.TaggedError<SigningError>()("SigningError", {
  cause: Schema.Unknown,
  op: Schema.Literals(["abortMultipart", "createMultipart", "listParts", "presignPart"]),
}) {}

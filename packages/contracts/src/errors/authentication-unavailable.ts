import * as Schema from "effect/Schema";

export class AuthenticationUnavailable extends Schema.TaggedError<AuthenticationUnavailable>()(
  "AuthenticationUnavailable",
  { message: Schema.String },
) {}

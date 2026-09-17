import * as Schema from "effect/Schema";

export class Principal extends Schema.Class<Principal>("Principal")({
  email: Schema.String,
  id: Schema.String,
  image: Schema.NullOr(Schema.String),
  name: Schema.String,
}) {}

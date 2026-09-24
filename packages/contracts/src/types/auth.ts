import * as Schema from "effect/Schema";

const PrincipalSchema = Schema.Struct({
  email: Schema.String,
  id: Schema.String,
  image: Schema.NullOr(Schema.String),
  name: Schema.String,
});
export { PrincipalSchema as Principal };
export type Principal = typeof PrincipalSchema.Type;

import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

export const Principal = Schema.Struct({
  email: Schema.String,
  id: Schema.String,
  image: Schema.NullOr(Schema.String),
  name: Schema.String,
});
export interface Principal extends Schema.Schema.Type<typeof Principal> {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

/** The session store failed, so whether the caller is signed in is unknown. */
export class AuthenticationUnavailable extends Schema.TaggedError<AuthenticationUnavailable>()(
  "AuthenticationUnavailable",
  {},
) {}

export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()(
  "tranzfer/CurrentPrincipal",
) {}

export class Authenticated extends RpcMiddleware.Service<
  Authenticated,
  { provides: CurrentPrincipal; requires: HttpServerRequest.HttpServerRequest }
>()("tranzfer/Authenticated", {
  error: Schema.Union([Unauthorized, AuthenticationUnavailable]),
  requiredForClient: false,
}) {}

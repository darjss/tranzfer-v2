import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

import { Unauthorized } from "./errors/auth";
import { AuthenticationUnavailable } from "./errors/authentication-unavailable";
import type { Principal } from "./types/auth";

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

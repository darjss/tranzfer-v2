import * as Context from "effect/Context";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

import { Unauthorized } from "./errors/auth";
import type { Principal } from "./types/auth";

export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()(
  "tranzfer/CurrentPrincipal",
) {}

export class Authenticated extends RpcMiddleware.Service<
  Authenticated,
  { provides: CurrentPrincipal }
>()("tranzfer/Authenticated", {
  error: Unauthorized,
  requiredForClient: false,
}) {}

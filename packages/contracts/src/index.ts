import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { Authenticated } from "./auth";
import { Unauthorized } from "./errors/auth";
import { ProbeFailed } from "./errors/infra";
import { Principal } from "./types/auth";

export { Authenticated, CurrentPrincipal } from "./auth";
export { Unauthorized } from "./errors/auth";
export { ProbeFailed } from "./errors/infra";
export { Principal } from "./types/auth";

export class Api extends RpcGroup.make(
  Rpc.make("Health", { success: Schema.Struct({ ok: Schema.Literal(true) }) }),
  Rpc.make("Infra", {
    error: ProbeFailed,
    success: Schema.Struct({ d1: Schema.Boolean, r2: Schema.Boolean }),
  }),
  Rpc.make("Me", { error: Unauthorized, success: Principal }).middleware(Authenticated),
) {}

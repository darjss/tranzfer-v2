import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { ProbeFailed } from "./errors";

export { ProbeFailed } from "./errors";

export class Api extends RpcGroup.make(
  Rpc.make("Health", { success: Schema.Struct({ ok: Schema.Literal(true) }) }),
  Rpc.make("Infra", {
    error: ProbeFailed,
    success: Schema.Struct({ d1: Schema.Boolean, r2: Schema.Boolean }),
  }),
) {}

import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

export class ProbeFailed extends Schema.TaggedError<ProbeFailed>()("ProbeFailed", {
  resource: Schema.Literals(["d1", "r2"]),
}) {}

export class Api extends RpcGroup.make(
  Rpc.make("Health", { success: Schema.Struct({ ok: Schema.Literal(true) }) }),
  Rpc.make("Infra", {
    error: ProbeFailed,
    payload: { key: Schema.NonEmptyString },
    success: Schema.Struct({ d1: Schema.Boolean, r2: Schema.Boolean }),
  }),
) {}

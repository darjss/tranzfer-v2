import { Drizzle } from "@tranzfer/db";
import * as Layer from "effect/Layer";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

import { InfraHandlers } from "./handlers/infra";
import { AuthenticatedLive } from "./middleware";
import { Auth } from "./services/auth";

export const AppLayer = Layer.mergeAll(
  InfraHandlers,
  AuthenticatedLive,
  RpcSerialization.layerJson,
  Auth.layer,
).pipe(Layer.provide(Drizzle.layer));

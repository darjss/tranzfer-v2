import { Api } from "@tranzfer/contracts";
import { D1Client } from "@tranzfer/db";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { InfraHandlers } from "./handlers/infra";

export class RpcHandler extends Context.Service<
  RpcHandler,
  {
    readonly handle: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      Scope.Scope | HttpServerRequest.HttpServerRequest
    >;
  }
>()("tranzfer/RpcHandler") {
  static readonly layer = Layer.effect(
    RpcHandler,
    Effect.map(RpcServer.toHttpEffect(Api), (handle) => RpcHandler.of({ handle })),
  ).pipe(Layer.provide(Layer.mergeAll(InfraHandlers, RpcSerialization.layerJson)));
}

// RpcHandler needs D1Client, so mergeAll cannot build them in parallel:
// provideMerge wires the dependency edge explicitly.
export const AppLayer = RpcHandler.layer.pipe(Layer.provideMerge(D1Client.layer));

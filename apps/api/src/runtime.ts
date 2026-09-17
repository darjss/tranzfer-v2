import { Api } from "@tranzfer/contracts";
import { Drizzle } from "@tranzfer/db";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { InfraHandlers } from "./handlers/infra";
import { Auth } from "./services/auth";

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

// RpcHandler needs Drizzle and Auth.layer is itself built on Drizzle, so
// mergeAll cannot build them in parallel: provideMerge wires both dependency
// edges explicitly. Auth.layer self-provides Drizzle.layer, which brings its
// own Database dependency; what remains is WorkerEnvironment, provided by the
// worker entrypoint.
export const AppLayer = RpcHandler.layer.pipe(
  Layer.provideMerge(Drizzle.layer),
  Layer.provideMerge(Auth.layer),
);

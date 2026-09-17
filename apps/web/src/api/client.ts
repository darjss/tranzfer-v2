import { Api } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

export class ApiClient extends Context.Service<
  ApiClient,
  RpcClient.FromGroup<Api, RpcClientError>
>()("tranzfer/ApiClient") {
  static readonly layer = Layer.effect(ApiClient, RpcClient.make(Api));
}

export const WebLayer = ApiClient.layer.pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
      Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
    ),
  ),
);

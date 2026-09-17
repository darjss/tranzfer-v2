import { Api } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

// FromGroup<Api> collapses to {} on rc.115; the shape is derived from the
// make() call the layer runs instead.
const makeApiClient = RpcClient.make(Api);

export class ApiClient extends Context.Service<ApiClient, Effect.Success<typeof makeApiClient>>()(
  "tranzfer/ApiClient",
) {
  static readonly layer = Layer.effect(ApiClient, makeApiClient);
}

export const WebLayer = ApiClient.layer.pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
      Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
    ),
  ),
);

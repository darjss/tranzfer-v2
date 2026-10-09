import { Api } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as RpcClient from "effect/rpc/RpcClient";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcSerialization from "effect/rpc/RpcSerialization";

import { BrowserTracing } from "./telemetry";

export class ApiClient extends Context.Service<
  ApiClient,
  RpcClient.FromGroup<typeof Api, RpcClientError>
>()("tranzfer/ApiClient") {
  static readonly layer = Layer.effect(ApiClient, RpcClient.make(Api));
}

export const WebLayer = ApiClient.layer.pipe(
  Layer.provide(
    RpcClient.layerProtocolHttp({
      // prependUrl adds a trailing slash to the transport's empty path.
      transformClient: HttpClient.mapRequest(HttpClientRequest.setUrl("/rpc")),
      url: "/rpc",
    }).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer])),
  ),
  // Merged, not provided: spans are made in the caller's fiber, so the
  // tracer has to be in the runtime's context. RPC calls send `traceparent`,
  // which the API reads, so a call and its server work share one trace.
  Layer.provideMerge(BrowserTracing),
);

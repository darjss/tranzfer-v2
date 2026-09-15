import { Api } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Scope from "effect/Scope";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

// `Fetch` is a fiber reference read at request time, so it must live in the
// runtime context, not only in the protocol layer's inputs.
export const makeApi = (fetch: typeof globalThis.fetch, url: string) => {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      RpcClient.layerProtocolHttp({
        // prependUrl joins with a trailing slash; pin requests to the exact
        // endpoint so the Worker sees "/rpc", not "/rpc/".
        transformClient: HttpClient.mapRequest(HttpClientRequest.setUrl(url)),
        url,
      }).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer])),
      Layer.succeed(FetchHttpClient.Fetch, fetch),
    ),
  );
  const scope = runtime.runSync(Scope.make());
  const client = runtime.runSync(Effect.provideService(RpcClient.make(Api), Scope.Scope, scope));
  return { client, runtime };
};

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

const buildApi = async () => {
  // Lazy: the prerenderer imports the server bundle in Node, where
  // `cloudflare:workers` does not exist. Only workerd reaches this.
  const { env } = await import("cloudflare:workers");
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      RpcClient.layerProtocolHttp({
        // prependUrl joins with a trailing slash; pin requests to the exact
        // endpoint so the Worker sees "/rpc", not "/rpc/".
        transformClient: HttpClient.mapRequest(HttpClientRequest.setUrl("http://api/rpc")),
        url: "http://api/rpc",
      }).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer])),
      // Fetch is a Context.Reference read per request, so a sibling succeed
      // layer is the injection point — providing it to the protocol layer
      // would scope it to layer construction instead.
      Layer.succeed(FetchHttpClient.Fetch, env.API.fetch.bind(env.API)),
    ),
  );
  const client = runtime.runSync(
    Effect.provideService(RpcClient.make(Api), Scope.Scope, runtime.scope),
  );
  return { client, runtime };
};

let api: ReturnType<typeof buildApi> | undefined;

// `env.API` is the same service binding for the isolate's life, so one client
// and runtime serve every request.
export const apiOverBinding = async () => await (api ??= buildApi());

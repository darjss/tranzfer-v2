import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Predicate from "effect/Predicate";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

import { ApiClient } from "./client";

// Deferred to the first call and kept out of a string literal: the client
// graph reaches this file through isServer-dead branches, where import
// analysis would fail resolving `cloudflare:workers`. Only workerd (where it
// is a builtin) ever evaluates it.
const workersModule = "cloudflare:workers";

const hasWorkerEnv = (value: unknown): value is { env: Cloudflare.Env } =>
  Predicate.isObject(value) && "env" in value;

const bindingFetch: typeof globalThis.fetch = async (input, init) => {
  const workers: unknown = await import(workersModule);
  if (!hasWorkerEnv(workers)) {
    throw new TypeError("cloudflare:workers did not expose env");
  }
  return await workers.env.API.fetch(input, init);
};

// The SSR counterpart of WebLayer: workerd cannot resolve the relative
// "/rpc" and a worker-side fetch would not carry the browser's credentials,
// so requests go over the API service binding with the incoming cookie.
export const serverLayer = (cookie: string | null) =>
  Layer.mergeAll(
    ApiClient.layer.pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({
          // prependUrl joins with a trailing slash; pin requests to the
          // exact endpoint so the Worker sees "/rpc", not "/rpc/".
          transformClient: HttpClient.mapRequest((request) =>
            HttpClientRequest.setUrl(
              cookie === null ? request : HttpClientRequest.setHeader(request, "cookie", cookie),
              "http://api/rpc",
            ),
          ),
          url: "http://api/rpc",
        }).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer])),
      ),
    ),
    // Fetch is a Context.Reference read per request, so a sibling succeed
    // layer is the injection point — providing it to the protocol layer
    // would scope it to layer construction instead.
    Layer.succeed(FetchHttpClient.Fetch, bindingFetch),
  );

const buildApi = () => {
  const runtime = ManagedRuntime.make(serverLayer(null));
  return { client: runtime.runSync(Effect.service(ApiClient)), runtime };
};

let api: ReturnType<typeof buildApi> | undefined;

// `env.API` is the same service binding for the isolate's life, so one client
// and runtime serve every request.
export const apiOverBinding = () => (api ??= buildApi());

import { Api, ProbeFailed } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import { Environment, Worker } from "effect-cf";

import "./env";

const probeD1 = (env: Cloudflare.Env) =>
  Effect.tryPromise({
    catch: () => new ProbeFailed({ resource: "d1" }),
    try: async () => await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>(),
  }).pipe(
    Effect.flatMap((row) => (row?.ok === 1 ? Effect.void : new ProbeFailed({ resource: "d1" }))),
  );

const probeR2 = (env: Cloudflare.Env, key: string) =>
  Effect.tryPromise({
    catch: () => new ProbeFailed({ resource: "r2" }),
    try: async () => {
      await env.BUCKET.put(key, "ok");
      const object = await env.BUCKET.get(key);
      const text = object === null ? null : await object.text();
      await env.BUCKET.delete(key);
      if (text !== "ok") {
        throw new Error("r2 probe round-trip mismatch");
      }
    },
  });

const handlersLayer = Layer.unwrap(
  Effect.gen(function* handlers() {
    const env = yield* Environment.WorkerEnvironment;
    return Api.toLayer({
      Health: () => Effect.succeed({ ok: true as const }),
      Infra: (payload) =>
        probeD1(env).pipe(
          Effect.andThen(probeR2(env, payload.key)),
          Effect.map(() => ({ d1: true, r2: true })),
        ),
    });
  }),
);

class RpcHandler extends Context.Service<
  RpcHandler,
  {
    readonly handle: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      Scope.Scope | HttpServerRequest.HttpServerRequest
    >;
  }
>()("tranzfer-api/RpcHandler") {
  static readonly layer = Layer.effect(
    RpcHandler,
    Effect.map(RpcServer.toHttpEffect(Api), (handle) => RpcHandler.of({ handle })),
  ).pipe(Layer.provide(Layer.mergeAll(handlersLayer, RpcSerialization.layerJson)));
}

const fetch = Effect.gen(function* fetchWorker() {
  const request = yield* Worker.NativeRequest;
  const { pathname } = new URL(request.url);
  if (pathname === "/rpc") {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    return yield* (yield* RpcHandler).handle;
  }
  if (pathname === "/health") {
    return Response.json({ ok: true });
  }
  return new Response(null, { status: 404 });
});

export default Worker.make(RpcHandler.layer, { fetch });

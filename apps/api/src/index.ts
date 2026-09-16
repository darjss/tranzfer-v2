import { Api, ProbeFailed } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import { sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import type * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import { Environment, Worker } from "effect-cf";

import { Db } from "./db";
import "./env";
import * as R2 from "./r2";

const probeD1 = Effect.gen(function* probeD1() {
  const db = yield* Db;
  const row = yield* db
    .get<{ ok: number }>(sql`SELECT 1 AS ok`)
    .pipe(Effect.mapError((error) => new ProbeFailed({ message: String(error), resource: "d1" })));
  if (row?.ok !== 1) {
    return yield* new ProbeFailed({ message: "no row", resource: "d1" });
  }
  return yield* Effect.void;
});

const probeR2 = (env: Cloudflare.Env) => {
  const key = `infra-probe/${crypto.randomUUID()}`;
  return Effect.tryPromise({
    catch: (error) => new ProbeFailed({ message: String(error), resource: "r2" }),
    try: async () => {
      await env.BUCKET.put(key, "ok");
      const object = await env.BUCKET.get(key);
      const text = object === null ? null : await object.text();
      if (text !== "ok") {
        throw new Error("r2 probe round-trip mismatch");
      }
    },
  }).pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        await env.BUCKET.delete(key);
      }),
    ),
  );
};

const s3Layer = Layer.unwrap(
  Effect.gen(function* s3() {
    const env = yield* Environment.WorkerEnvironment;
    return R2.make({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      accountId: env.R2_ACCOUNT_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    });
  }),
);

const handlersLayer = Layer.unwrap(
  Effect.gen(function* handlers() {
    const env = yield* Environment.WorkerEnvironment;
    return Api.toLayer({
      Health: () => Effect.succeed({ ok: true as const }),
      Infra: () =>
        probeD1.pipe(
          Effect.andThen(probeR2(env)),
          Effect.map(() => ({ d1: true, r2: true })),
        ),
    });
  }),
).pipe(Layer.provide(Layer.mergeAll(Db.layer, s3Layer)));

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

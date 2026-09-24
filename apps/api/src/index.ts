import { Api } from "@tranzfer/contracts";
import { Database, Drizzle } from "@tranzfer/db";
import { Random, RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { AuthHandlers } from "./handlers/auth";
import { DeliveriesHandlers } from "./handlers/deliveries";
import { InfraHandlers } from "./handlers/infra";
import { LinkHandlers } from "./handlers/links";
import { AuthenticatedLive } from "./middleware";
import { App } from "./resources";
import { Auth } from "./services/auth";
import { Links } from "./services/links";
import { deployStage } from "./services/stage";
import { Storage } from "./services/storage";
import { ApiWorker } from "./worker";

export { ApiWorker } from "./worker";

export default ApiWorker.make(
  {
    compatibility: { date: "2026-09-08" },
    dev: { port: 8787, strictPort: true },
    main: import.meta.url,
  },
  Effect.gen(function* impl() {
    const db = yield* Cloudflare.D1.QueryDatabase(App);
    // The accessor stays lazy: this impl also evaluates at deploy time, when
    // the env holds no D1 binding.
    const database = Layer.succeed(Database, db.raw.pipe(Effect.provide(RuntimeContext.phantom)));
    const stage = yield* deployStage;
    const auth = yield* Match.value(stage).pipe(
      Match.when("production", () => Auth.production),
      Match.when("staging", () => Auth.staging),
      Match.when("dev", () => Auth.dev),
      Match.exhaustive,
      Effect.orDie,
      Effect.provide(database),
    );

    const storage = yield* Match.value(stage).pipe(
      Match.whenOr("production", "staging", () => Storage.deployed),
      Match.when("dev", () => Effect.succeed(Storage.unavailable)),
      Match.exhaustive,
    );

    const linkSecret = yield* Random("LinkSecret");
    const links = Links.make((yield* linkSecret.text).pipe(Effect.provide(RuntimeContext.phantom)));

    // Init builds each service once per isolate; only the auth-dependent part
    // of the RPC stack is rebuilt per request (the Me middleware needs HttpServerRequest).
    const services = yield* Layer.build(
      Layer.mergeAll(Drizzle.layer, storage, links).pipe(Layer.provide(database)),
    );
    const servicesLayer = Layer.succeedContext(services);
    const rpcInit = yield* Layer.build(
      Layer.mergeAll(InfraHandlers, LinkHandlers, RpcSerialization.layerJson).pipe(
        Layer.provide(servicesLayer),
      ),
    );
    const rpcRequest = Layer.fresh(
      Layer.mergeAll(AuthHandlers, AuthenticatedLive, DeliveriesHandlers).pipe(
        Layer.provide(servicesLayer),
        Layer.provide(Layer.succeed(Auth, auth)),
      ),
    );

    const routes = Layer.mergeAll(
      HttpRouter.add("*", "/api/auth/*", auth.fetch),
      HttpRouter.add(
        "POST",
        "/rpc",
        Effect.gen(function* rpc() {
          const context = Context.merge(rpcInit, yield* Layer.build(rpcRequest));
          const handle = yield* RpcServer.toHttpEffect(Api).pipe(Effect.provideContext(context));
          return yield* handle;
        }),
      ),
      HttpRouter.add("GET", "/health", HttpServerResponse.json({ ok: true })),
    );
    const handle = yield* routes.pipe(
      Layer.provide(HttpServer.layerServices),
      HttpRouter.toHttpEffect,
      Effect.provideService(Layer.CurrentMemoMap, yield* Layer.makeMemoMap),
    );
    return { fetch: handle };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(Cloudflare.D1.QueryDatabaseBinding, Cloudflare.R2.ReadBucketBinding),
    ),
  ),
);

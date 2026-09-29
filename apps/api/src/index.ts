import { Api } from "@tranzfer/contracts";
import { Database, Drizzle } from "@tranzfer/db";
import { Random, RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
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

    // Services and handlers that never read the request build once per isolate.
    const shared = yield* Layer.build(
      Layer.mergeAll(InfraHandlers, LinkHandlers, RpcSerialization.layerJson).pipe(
        Layer.provideMerge(
          Layer.mergeAll(Drizzle.layer, storage, links, Layer.succeed(Auth, auth)),
        ),
        Layer.provide(database),
      ),
    );

    const routes = Layer.mergeAll(
      HttpRouter.add("*", "/api/auth/*", auth.fetch),
      HttpRouter.add(
        "POST",
        "/rpc",
        Effect.flatten(RpcServer.toHttpEffect(Api)).pipe(
          // Authenticated requires the HttpServerRequest, so these build per
          // request in a fresh memo map.
          Effect.provide(Layer.mergeAll(AuthHandlers, AuthenticatedLive, DeliveriesHandlers), {
            local: true,
          }),
          Effect.provideContext(shared),
        ),
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

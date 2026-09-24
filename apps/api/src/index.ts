import { Api } from "@tranzfer/contracts";
import { Database, Drizzle } from "@tranzfer/db";
import { Random, RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { AuthHandlers } from "./handlers/auth";
import { DeliveriesHandlers } from "./handlers/deliveries";
import { InfraHandlers } from "./handlers/infra";
import { LinkHandlers } from "./handlers/links";
import { AuthenticatedLive } from "./middleware";
import { App, Files } from "./resources";
import { Auth, isDeployedStage } from "./services/auth";
import { Links } from "./services/links";
import { Storage } from "./services/storage";
import { ApiWorker } from "./worker";

export { ApiWorker } from "./worker";

export default ApiWorker.make(
  {
    compatibility: { date: "2026-09-08" },
    dev: { port: 8787, strictPort: true },
    main: import.meta.url,
    name: "tranzfer-api",
  },
  Effect.gen(function* impl() {
    const db = yield* Cloudflare.D1.QueryDatabase(App);
    // The accessor stays lazy: this impl also evaluates at deploy time, when
    // the env holds no D1 binding.
    const database = Layer.succeed(Database, db.raw.pipe(Effect.provide(RuntimeContext.phantom)));
    // Init-time config failures are fatal; deploy dies with the defect.
    const auth = yield* Auth.make.pipe(Effect.orDie, Effect.provide(database));

    // Only deployed stages get a real bucket-scoped token; dev stages use a
    // local bucket simulator and their Storage reports "needs a deployed
    // stage" instead of minting Cloudflare credentials.
    const deployed = yield* isDeployedStage;
    let storage = Storage.unavailable;
    if (deployed) {
      const files = yield* Files;
      const token = yield* Cloudflare.ApiToken.AccountApiToken("FilesToken", {
        policies: [
          {
            effect: "allow",
            permissionGroups: [
              "Workers R2 Storage Bucket Item Read",
              "Workers R2 Storage Bucket Item Write",
            ],
            resources: Output.all(files.accountId, files.jurisdiction, files.bucketName).pipe(
              Output.map(([accountId, jurisdiction, bucketName]) => ({
                [`com.cloudflare.edge.r2.bucket.${accountId}_${jurisdiction}_${bucketName}`]: "*",
              })),
            ),
          },
        ],
      });
      storage = Storage.make({
        accountId: (yield* files.accountId).pipe(Effect.provide(RuntimeContext.phantom)),
        bucket: (yield* files.bucketName).pipe(Effect.provide(RuntimeContext.phantom)),
        tokenId: (yield* token.tokenId).pipe(Effect.provide(RuntimeContext.phantom)),
        tokenValue: (yield* token.value).pipe(Effect.provide(RuntimeContext.phantom)),
      });
    }

    const linkSecret = yield* Random("LinkSecret");
    const links = Links.make((yield* linkSecret.text).pipe(Effect.provide(RuntimeContext.phantom)));

    // Services build once at Init so cached work (the R2 token hash, the HMAC
    // key import) really happens once per isolate. Only the auth-dependent
    // part of the RPC stack is rebuilt per request, because the Me handler's
    // middleware requires HttpServerRequest.
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

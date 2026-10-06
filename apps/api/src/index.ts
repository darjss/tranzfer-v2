import { Api } from "@tranzfer/contracts";
import { Database } from "@tranzfer/db";
import { Random, RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";

import { Deliveries } from "./deliveries";
import { LinkTokens } from "./link-tokens";
import { ApiHandlers, AuthenticatedLive } from "./rpc";
import { SharedLinks } from "./shared-links";
import { Storage } from "./storage";
import { sweep } from "./sweeper";
import { Transfers } from "./transfers";
import { Auth, makeAuth } from "./infrastructure/auth";
import { filesStorage } from "./infrastructure/r2";
import { deployStage } from "./infrastructure/stage";
import { App } from "./resources";
import { ApiWorker } from "./worker";

export default ApiWorker.make(
  {
    compatibility: { date: "2026-09-08" },
    dev: { port: 8787, strictPort: true },
    main: import.meta.url,
  },
  Effect.gen(function* impl() {
    // This effect also runs at deploy time, when no binding exists, so the D1
    // handle and every secret stay lazy until an invocation reads them.
    const d1 = yield* Cloudflare.D1.QueryDatabase(App);
    const handle = d1.raw.pipe(Effect.provide(RuntimeContext.phantom));
    const linkSecret = yield* Random("LinkSecret");

    const isolate = yield* Layer.build(
      Layer.mergeAll(
        yield* filesStorage,
        LinkTokens.layer((yield* linkSecret.text).pipe(Effect.provide(RuntimeContext.phantom))),
        Layer.effect(Auth, makeAuth(yield* deployStage, handle)),
        RpcSerialization.layerJson,
      ),
    );

    // A D1 client belongs to one invocation, so the services over it are
    // rebuilt per request (and per cron run) with a fresh memo map.
    const domain = Layer.mergeAll(Transfers.layer, SharedLinks.layer).pipe(
      Layer.provideMerge(Deliveries.layer),
      Layer.provideMerge(Layer.unwrap(Effect.map(handle, Database.fromD1))),
    );
    const perInvocation = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provide(domain, { local: true }), Effect.provideContext(isolate));

    yield* Cloudflare.Workers.cron("* * * * *", () => perInvocation(sweep));

    const health = Effect.gen(function* health() {
      const { db } = yield* Database;
      yield* db.run(sql`SELECT 1`);
      const storage = yield* Storage;
      yield* storage.head("health/probe");
      return HttpServerResponse.jsonUnsafe({ ok: true });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ ok: false }, { status: 503 })),
      ),
    );

    const routes = Layer.mergeAll(
      HttpRouter.add(
        "*",
        "/api/auth/*",
        Effect.flatMap(Effect.service(Auth), (auth) => auth.fetch).pipe(
          Effect.provideContext(isolate),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/rpc",
        perInvocation(
          Effect.flatten(RpcServer.toHttpEffect(Api)).pipe(
            Effect.provide(Layer.mergeAll(ApiHandlers, AuthenticatedLive), { local: true }),
          ),
        ),
      ),
      HttpRouter.add("GET", "/health", perInvocation(health)),
    );
    const handle_ = yield* routes.pipe(
      Layer.provide(HttpServer.layerServices),
      HttpRouter.toHttpEffect,
      Effect.provideService(Layer.CurrentMemoMap, yield* Layer.makeMemoMap),
    );
    return { fetch: handle_ };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.R2.ReadBucketBinding,
        Cloudflare.Workers.CronEventSourceLive,
      ),
    ),
  ),
);

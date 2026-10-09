import { Api, plans, rateLimits } from "@tranzfer/contracts";
import type { PaidPlanId } from "@tranzfer/contracts";
import { Database } from "@tranzfer/db";
import { Random, RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { retain } from "alchemy/RemovalPolicy";
import { sql } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import * as Schema from "effect/Schema";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";

import { Billing, InvalidWebhook } from "./billing";
import { Deliveries } from "./deliveries";
import { LinkTokens } from "./link-tokens";
import { ApiHandlers, AuthenticatedLive } from "./rpc";
import { SharedLinks } from "./shared-links";
import { Storage } from "./storage";
import { sweep } from "./sweeper";
import { SigningRate, Transfers } from "./transfers";
import { Auth, makeAuth } from "./infrastructure/auth";
import { PolarProduct, PolarWebhook, paidPlansOpen, polarAccess } from "./infrastructure/polar";
import { filesStorage, lazy } from "./infrastructure/r2";
import { deployStage, stageName } from "./infrastructure/stage";
import { relayConfig, relayTraces, telemetry } from "./infrastructure/telemetry";
import { App } from "./resources";
import { ApiWorker } from "./worker";

const productProps = (plan: PaidPlanId) => ({
  name: `Tranzfer ${plans[plan].name}`,
  plan,
  priceCents: plans[plan].monthlyUsd * 100,
});

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

    const { origin } = yield* Config.schema(Schema.URLFromString, "APP_URL");
    const stage = yield* deployStage;
    // One product per paid plan and one webhook endpoint per stage, created at
    // deploy time by the Polar providers in infra/. Ids and the signing secret
    // reach the Worker as bindings and resolve per invocation. A stage whose
    // paid plans are closed declares none of them.
    const polar = yield* Effect.when(
      Effect.gen(function* polarBilling() {
        const products = {
          pro: yield* PolarProduct("Polar-pro", productProps("pro")).pipe(retain()),
          starter: yield* PolarProduct("Polar-starter", productProps("starter")).pipe(retain()),
          studio: yield* PolarProduct("Polar-studio", productProps("studio")).pipe(retain()),
        };
        return {
          access: yield* polarAccess,
          products: Effect.all({
            pro: lazy(yield* products.pro.id),
            starter: lazy(yield* products.starter.id),
            studio: lazy(yield* products.studio.id),
          }),
          // Local stages have no URL Polar can reach, so they get no endpoint
          // and read Polar directly instead.
          reconcileOnRead: stage === "dev",
          webhookSecret:
            stage === "dev"
              ? Effect.fail(new InvalidWebhook({ reason: "disabled" }))
              : lazy(
                  yield* (yield* PolarWebhook("PolarWebhook", {
                    events: [
                      "subscription.created",
                      "subscription.active",
                      "subscription.updated",
                      "subscription.canceled",
                      "subscription.uncanceled",
                      "subscription.revoked",
                      "subscription.past_due",
                    ],
                    url: `${origin}/api/polar/webhook`,
                  })).secret,
                ),
        };
      }),
      paidPlansOpen,
    );
    const billing = Billing.layer({ appUrl: origin, polar });

    // Rate-limit namespaces are account-wide, so every stage shares the
    // counters and the key carries the stage name.
    const stageKey = yield* stageName;
    const limiter = (client: Cloudflare.RateLimitClient) => (key: string) =>
      client.limit({ key: `${stageKey}:${key}` }).pipe(
        Effect.map(({ success }) => success),
        // A limiter outage must not lock anyone out.
        Effect.catchTag("RateLimitError", (error) =>
          Effect.logWarning("rate limit check failed", error.message).pipe(Effect.as(true)),
        ),
        Effect.provide(RuntimeContext.phantom),
      );
    const authRequests = yield* Cloudflare.RateLimit("AUTH_REQUESTS", {
      namespaceId: 1001,
      simple: {
        limit: rateLimits.authRequests.limit,
        period: rateLimits.authRequests.windowSeconds,
      },
    });
    const uploadSigning = yield* Cloudflare.RateLimit("UPLOAD_SIGNING", {
      namespaceId: 1002,
      simple: {
        limit: rateLimits.uploadSigning.limit,
        period: rateLimits.uploadSigning.windowSeconds,
      },
    });

    const isolate = yield* Layer.build(
      Layer.mergeAll(
        yield* filesStorage,
        LinkTokens.layer((yield* linkSecret.text).pipe(Effect.provide(RuntimeContext.phantom))),
        Layer.effect(Auth, makeAuth(stage, handle, limiter(authRequests))),
        Layer.succeed(SigningRate, SigningRate.of({ allow: limiter(uploadSigning) })),
        RpcSerialization.layerJson,
      ),
    );

    // A D1 client belongs to one invocation, so the services over it are
    // rebuilt per request (and per cron run) with a fresh memo map.
    const domain = Layer.mergeAll(Transfers.layer, SharedLinks.layer, billing).pipe(
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
      HttpRouter.add(
        "POST",
        "/api/polar/webhook",
        perInvocation(
          Effect.gen(function* polarWebhook() {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const body = yield* request.text;
            const status = yield* (yield* Billing).webhook(request.headers, body).pipe(
              Effect.as(204),
              Effect.catchTags({
                // Polar retries a 5xx; a rejected delivery is not worth retrying.
                BillingUnavailable: () => Effect.succeed(503),
                InvalidWebhook: (error) =>
                  Effect.logWarning("polar webhook rejected", error.reason).pipe(Effect.as(401)),
              }),
            );
            return HttpServerResponse.empty({ status });
          }),
        ),
      ),
      HttpRouter.add("GET", "/health", perInvocation(health)),
      HttpRouter.add("POST", "/api/telemetry/traces", relayTraces(yield* relayConfig)),
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
        Cloudflare.RateLimitBinding,
        Cloudflare.Workers.CronEventSourceLive,
        FetchHttpClient.layer,
        telemetry,
      ),
    ),
  ),
);

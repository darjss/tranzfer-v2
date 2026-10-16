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

import { Attempts } from "./attempts";
import { Billing, InvalidWebhook } from "./billing";
import { Deliveries } from "./deliveries";
import { Emails } from "./emails";
import { FileRequests } from "./file-requests";
import { LinkTokens } from "./link-tokens";
import { Plans } from "./plans";
import { ApiHandlers, AuthenticatedLive } from "./rpc";
import { SharedLinks } from "./shared-links";
import { Storage } from "./storage";
import { sweep } from "./sweeper";
import { SigningRate, Transfers } from "./transfers";
import { Auth } from "./infrastructure/auth";
import { emailAllowlist, Mail } from "./infrastructure/email";
import { PolarProduct, PolarWebhook, paidPlansOpen, polarAccess } from "./infrastructure/polar";
import { filesStorage, lazy } from "./infrastructure/r2";
import { deployStage, stageName } from "./infrastructure/stage";
import { relayConfig, relayTraces, telemetry } from "./infrastructure/telemetry";
import { App } from "./resources";
import { ApiWorker } from "./worker";

// Cloudflare rate-limit namespace ids are unique per account, and every stage
// shares them. The id is the key, so two limits that take the same id do not
// compile. Take the next number; never reuse or renumber one.
const rateLimitBindings = {
  1001: "AUTH_REQUESTS",
  1002: "UPLOAD_SIGNING",
  1004: "INTEREST_SIGNUPS",
  1005: "EMAIL_REQUESTS",
  1008: "PORTAL_CALLS_PER_IP",
  1009: "PORTAL_CALLS_PER_REQUEST",
  1010: "PORTAL_UPLOADS_PER_IP",
  1011: "TELEMETRY_RELAY",
} as const;

const rateLimit = (
  namespaceId: keyof typeof rateLimitBindings,
  {
    limit,
    windowSeconds,
  }: { limit: number; windowSeconds: Cloudflare.RateLimitProps["simple"]["period"] },
) =>
  Cloudflare.RateLimit(rateLimitBindings[namespaceId], {
    namespaceId,
    simple: { limit, period: windowSeconds },
  });

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
    placement: { mode: "smart" },
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
    const authRequests = yield* rateLimit(1001, rateLimits.authRequests);
    const uploadSigning = yield* rateLimit(1002, rateLimits.uploadSigning);

    const interestSignups = yield* rateLimit(1004, rateLimits.interestSignups);

    const emailRequests = yield* rateLimit(1005, rateLimits.emailRequests);

    // File requests count uploader calls three ways, each with its own
    // namespace: per client IP, per request, and new uploads per client IP.
    const portalCallsPerIp = yield* rateLimit(1008, rateLimits.portalCallsPerIp);
    const portalCallsPerRequest = yield* rateLimit(1009, rateLimits.portalCallsPerRequest);
    const portalUploadsPerIp = yield* rateLimit(1010, rateLimits.portalUploadsPerIp);

    const telemetryRelay = yield* rateLimit(1011, rateLimits.telemetryRelay);

    // Sends through Cloudflare Email Sending as hello@tranzfer.app. The
    // domain is onboarded on the account, so any recipient is allowed.
    const email = yield* Cloudflare.Email.Send(yield* Cloudflare.Email.SendEmail("EMAIL"));
    const execution = yield* Cloudflare.WorkerExecutionContext;

    const isolate = yield* Layer.build(
      Layer.mergeAll(
        yield* filesStorage,
        LinkTokens.layer((yield* linkSecret.text).pipe(Effect.provide(RuntimeContext.phantom))),
        Auth.layer(stage, handle, limiter(authRequests)),
        Layer.succeed(SigningRate, SigningRate.of({ allow: limiter(uploadSigning) })),
        Mail.layer(stage, email, yield* emailAllowlist),
        RpcSerialization.layerJson,
      ),
    );

    // A D1 client belongs to one invocation, so the services over it are
    // rebuilt per request (and per cron run) with a fresh memo map.
    const database = Layer.unwrap(Effect.map(handle, Database.fromD1));
    const domain = Layer.mergeAll(
      SharedLinks.layer,
      billing,
      Emails.layer({
        allowDeliveryEmail: limiter(emailRequests),
        allowInterest: limiter(interestSignups),
        appUrl: origin,
        // Runs after the response, kept alive by the request's waitUntil.
        background: (effect) =>
          execution.waitUntil(effect).pipe(Effect.provide(RuntimeContext.phantom)),
      }),
      FileRequests.layer({
        callsPerIp: limiter(portalCallsPerIp),
        callsPerRequest: limiter(portalCallsPerRequest),
        uploadsPerIp: limiter(portalUploadsPerIp),
      }).pipe(Layer.provideMerge(Transfers.layer)),
    ).pipe(
      Layer.provideMerge(Deliveries.layer),
      Layer.provideMerge(Plans.layer),
      Layer.provideMerge(Attempts.layer),
      Layer.provideMerge(database),
    );
    const perInvocation = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.provide(domain, { local: true }), Effect.provideContext(isolate));

    // SameSite=Lax keeps cookies off cross-site POSTs, but staging and every
    // pr-<n> preview are same-site with production and run unmerged branches.
    // Browsers always send Origin and Sec-Fetch-Site on a fetch POST; the e2e
    // client, curl and the service binding send neither and pass.
    const sameSiteGuard = <E, R>(
      handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
    ) =>
      Effect.gen(function* guard() {
        const { headers } = yield* HttpServerRequest.HttpServerRequest;
        const site = headers["sec-fetch-site"];
        return site === "cross-site" ||
          site === "same-site" ||
          (headers.origin !== undefined && headers.origin !== origin)
          ? HttpServerResponse.empty({ status: 403 })
          : yield* handler;
      });

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
          Effect.provide(database, { local: true }),
          Effect.provideContext(isolate),
        ),
      ),
      HttpRouter.add(
        "POST",
        "/rpc",
        perInvocation(
          sameSiteGuard(
            Effect.flatten(RpcServer.toHttpEffect(Api)).pipe(
              Effect.provide(Layer.mergeAll(ApiHandlers, AuthenticatedLive), { local: true }),
            ),
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
      HttpRouter.add(
        "POST",
        "/api/telemetry/traces",
        relayTraces(yield* relayConfig, limiter(telemetryRelay)),
      ),
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
        Cloudflare.Email.SendBinding,
        Cloudflare.R2.ReadBucketBinding,
        Cloudflare.RateLimitBinding,
        Cloudflare.Workers.CronEventSourceLive,
        FetchHttpClient.layer,
        telemetry,
      ),
    ),
  ),
);

import * as Polar from "@distilled.cloud/polar";
import * as Provider from "alchemy/Provider";
import { Stage } from "alchemy/Stage";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";

import {
  PolarProduct,
  PolarWebhook,
  polarAccess,
  polarClient,
} from "../apps/api/src/infrastructure/polar";

// Credentials resolve per operation, because the stage picks the organization
// and the stage is only known while a resource is being deployed.
const withPolar = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Layer.unwrap(polarAccess.pipe(Effect.map((access) => polarClient(access))))),
  );

const priceOf = (cents: number) => [
  { amount_type: "fixed", price_amount: cents, price_currency: "usd" },
];

/**
 * Finds the plan's product by metadata, creates it when missing and corrects
 * its name or price. Every non-production stage shares the sandbox product,
 * so a stage never owns it: destroying a preview must not touch it.
 */
const polarProductProvider = () =>
  Provider.effect(
    PolarProduct,
    Effect.succeed({
      delete: () => Effect.void,
      reconcile: ({ news }) =>
        withPolar(
          Effect.gen(function* reconcileProduct() {
            const metadata = { tranzfer_plan: news.plan, tranzfer_price_cents: news.priceCents };
            const found = yield* Polar.productsList.items({ is_archived: false }).pipe(
              Stream.filter((product) => product.metadata.tranzfer_plan === news.plan),
              Stream.runHead,
            );
            if (Option.isNone(found)) {
              const created = yield* Polar.productsCreate({
                body: {
                  metadata,
                  name: news.name,
                  prices: priceOf(news.priceCents),
                  recurring_interval: "month",
                },
              });
              return { id: created.id };
            }
            const { id, metadata: current, name } = found.value;
            if (name !== news.name || current.tranzfer_price_cents !== news.priceCents) {
              yield* Polar.productsUpdate({
                id,
                metadata,
                name: news.name,
                prices: priceOf(news.priceCents),
              });
            }
            return { id };
          }),
        ),
    }),
  );

/** One endpoint per URL, so each stage owns its own and destroys it with the stage. */
const polarWebhookProvider = () =>
  Provider.effect(
    PolarWebhook,
    Effect.succeed({
      delete: ({ output }) =>
        withPolar(
          Polar.webhooksDeleteWebhookEndpoint({ id: output.id }).pipe(
            Effect.catchTag("NotFound", () => Effect.void),
          ),
        ),
      reconcile: ({ news }) =>
        withPolar(
          Effect.gen(function* reconcileWebhook() {
            const stage = yield* Stage;
            const events = [...news.events];
            const found = yield* Polar.webhooksListWebhookEndpoints.items({}).pipe(
              Stream.filter((endpoint) => endpoint.url === news.url),
              Stream.runHead,
            );
            const endpoint = yield* Option.match(found, {
              onNone: () =>
                Polar.webhooksCreateWebhookEndpoint({
                  events,
                  format: "raw",
                  name: `tranzfer ${stage}`,
                  url: news.url,
                }),
              onSome: (existing) =>
                existing.enabled &&
                existing.events.length === events.length &&
                events.every((event) => existing.events.includes(event))
                  ? Effect.succeed(existing)
                  : Polar.webhooksUpdateWebhookEndpoint({ enabled: true, events, id: existing.id }),
            });
            return {
              id: endpoint.id,
              secret: Redacted.isRedacted(endpoint.secret)
                ? endpoint.secret
                : Redacted.make(endpoint.secret),
            };
          }),
        ),
    }),
  );

export const polarProviders = () => Layer.mergeAll(polarProductProvider(), polarWebhookProvider());

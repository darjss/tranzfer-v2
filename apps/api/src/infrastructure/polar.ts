import * as Polar from "@distilled.cloud/polar";
import { Resource } from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Redacted } from "effect/Redacted";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { deployStage } from "./stage";

/**
 * Production bills against Polar's live organization. Every other stage uses
 * the sandbox organization, which never charges a card. The token variable
 * follows the stage, so one stage can never hold the other's credentials.
 */
export const polarAccess = Effect.gen(function* polarAccess() {
  const live = (yield* deployStage) === "production";
  const apiKey = yield* Config.Redacted(live ? "POLAR_ACCESS_TOKEN" : "POLAR_SANDBOX_ACCESS_TOKEN");
  return { apiBaseUrl: live ? "https://api.polar.sh" : "https://sandbox-api.polar.sh", apiKey };
}).pipe(Effect.orDie);

export const polarClient = (access: Effect.Success<typeof polarAccess>) =>
  Layer.mergeAll(
    FetchHttpClient.layer,
    Polar.PolarProtocol,
    Layer.succeed(Polar.Credentials, Effect.succeed(access)),
  );

/**
 * One recurring product per paid plan, shared by every non-production stage
 * (they all use the sandbox organization). Providers live in infra/ and
 * match a product by its `tranzfer_plan` metadata, not by stage.
 */
export type PolarProduct = Resource<
  "Tranzfer.PolarProduct",
  { readonly name: string; readonly plan: string; readonly priceCents: number },
  { readonly id: string }
>;
export const PolarProduct = Resource<PolarProduct>("Tranzfer.PolarProduct");

/** This stage's webhook endpoint. The secret signs every delivery to it. */
export type PolarWebhook = Resource<
  "Tranzfer.PolarWebhook",
  { readonly events: readonly Polar.WebhookEventType[]; readonly url: string },
  { readonly id: string; readonly secret: Redacted }
>;
export const PolarWebhook = Resource<PolarWebhook>("Tranzfer.PolarWebhook");

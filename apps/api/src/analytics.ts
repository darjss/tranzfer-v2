import type { PaidPlanId, UserId } from "@tranzfer/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

// PostHog's project token is a public, write-only ingest key, safe to ship in client code.
const POSTHOG_TOKEN = "phc_v4dprLKjoCdE2T36AwbM5PX3QhqxbGWAhMeZz42YYFZS";
const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";

type UploadKind = "delivery" | "request";

/**
 * Product events by name. Properties are counts, byte totals, plan ids and
 * kinds only: never an email, URL, query string, cookie, token, file name or IP.
 */
export type AnalyticsEvents = {
  readonly delivery_created: { readonly bytes: number; readonly files: number };
  readonly delivery_downloaded: Record<never, never>;
  readonly file_request_created: Record<never, never>;
  readonly link_opened: { readonly kind: UploadKind };
  readonly signed_up: Record<never, never>;
  readonly subscription_started: { readonly plan: PaidPlanId };
  readonly upload_completed: {
    readonly bytes: number;
    readonly files: number;
    readonly kind: UploadKind;
  };
};

/** Product analytics in PostHog, keyed by the account that owns the thing. */
export class Analytics extends Context.Service<
  Analytics,
  {
    /** Sends in the background and never fails; a lost event is only logged. */
    readonly capture: <K extends keyof AnalyticsEvents>(
      event: K,
      distinctId: UserId,
      properties: AnalyticsEvents[K],
    ) => Effect.Effect<void>;
  }
>()("tranzfer/Analytics") {
  /** Local `dev` stages send nothing. `background` runs an effect after the response. */
  static readonly layer = (options: {
    readonly stage: "production" | "staging" | "dev";
    readonly background: (effect: Effect.Effect<void>) => Effect.Effect<void>;
  }) =>
    Layer.effect(
      Analytics,
      Effect.gen(function* makeAnalytics() {
        const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
        return Analytics.of({
          capture: (event, distinctId, properties) =>
            options.stage === "dev"
              ? Effect.void
              : options.background(
                  Effect.gen(function* capture() {
                    const now = yield* Clock.currentTimeMillis;
                    yield* client.execute(
                      HttpClientRequest.post(POSTHOG_CAPTURE_URL).pipe(
                        HttpClientRequest.bodyJsonUnsafe({
                          api_key: POSTHOG_TOKEN,
                          distinct_id: distinctId,
                          event,
                          properties: { ...properties, stage: options.stage },
                          timestamp: new Date(now).toISOString(),
                        }),
                      ),
                    );
                  }).pipe(
                    Effect.timeout("5 seconds"),
                    // Only the tag: an HttpClientError carries the request and its payload.
                    Effect.catch((error) =>
                      Effect.logWarning("analytics capture failed", { error: error._tag, event }),
                    ),
                    // No client span: its attributes would carry the URL.
                    Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
                  ),
                ),
        });
      }),
    );
}

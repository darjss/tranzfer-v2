import * as Polar from "@distilled.cloud/polar";
import { BillingUnavailable, plans } from "@tranzfer/contracts";
import type { BillingSummary, PaidPlanId, PlanId, Principal } from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { Base64 } from "effect/encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { Deliveries } from "./deliveries";
import { polarClient } from "./infrastructure/polar";
import type { polarAccess } from "./infrastructure/polar";

/** The delivery is not from Polar: a missing header, a stale timestamp or a bad signature. */
export class InvalidWebhook extends Data.TaggedError("InvalidWebhook")<{
  readonly reason: "headers" | "payload" | "signature" | "timestamp";
}> {}

// Standard Webhooks allows five minutes of clock skew either way.
const TOLERANCE_SECONDS = 300;

/**
 * Checks a Polar delivery against Standard Webhooks. The HMAC key is the
 * UTF-8 bytes of the endpoint secret as Polar shows it (Polar's own SDK
 * base64-encodes it only to hand it to a library that decodes it again).
 * `subtle.verify` compares in constant time.
 */
export const verifyWebhook = Effect.fn("Billing.verifyWebhook")(function* verifyWebhook(
  secret: Redacted.Redacted,
  headers: Readonly<Record<string, string | undefined>>,
  body: string,
) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];
  if (id === undefined || timestamp === undefined || signatures === undefined) {
    return yield* new InvalidWebhook({ reason: "headers" });
  }
  const sentAt = Number(timestamp);
  const now = (yield* Clock.currentTimeMillis) / 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > TOLERANCE_SECONDS) {
    return yield* new InvalidWebhook({ reason: "timestamp" });
  }
  const encoder = new TextEncoder();
  const key = yield* Effect.promise(
    async () =>
      await crypto.subtle.importKey(
        "raw",
        encoder.encode(Redacted.value(secret)),
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["verify"],
      ),
  );
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);
  // The header holds space-separated `v1,<base64>` entries, one per active secret.
  const candidates = signatures.split(" ").flatMap((entry) => {
    const [version, signature] = entry.split(",", 2);
    if (version !== "v1" || signature === undefined) {
      return [];
    }
    return Result.match(Base64.decode(signature), {
      onFailure: () => [],
      onSuccess: (bytes) => [bytes],
    });
  });
  const matches = yield* Effect.forEach(
    candidates,
    (candidate) =>
      Effect.promise(async () => await crypto.subtle.verify("HMAC", key, candidate, signed)),
    { concurrency: "unbounded" },
  );
  return yield* matches.includes(true)
    ? Effect.void
    : Effect.fail(new InvalidWebhook({ reason: "signature" }));
});

// Subscription events embed their customer; the external id is our user id.
const WebhookEvent = Schema.Struct({
  data: Schema.Struct({
    customer: Schema.Struct({ external_id: Schema.NullOr(Schema.String) }),
  }),
});

const highestFirst = ["studio", "pro", "starter"] as const;

/** Billing for a signed-in user, kept in step with Polar through webhooks. */
export class Billing extends Context.Service<
  Billing,
  {
    readonly summary: (userId: string) => Effect.Effect<BillingSummary>;
    /** A subscriber changes plans in the portal; checkout would start a second subscription. */
    readonly checkout: (
      user: Principal,
      plan: PaidPlanId,
    ) => Effect.Effect<{ readonly url: string }, BillingUnavailable>;
    readonly portal: (
      userId: string,
    ) => Effect.Effect<{ readonly url: string }, BillingUnavailable>;
    /** Verifies a Polar delivery and refreshes the user it names. */
    readonly webhook: (
      headers: Readonly<Record<string, string | undefined>>,
      body: string,
    ) => Effect.Effect<void, InvalidWebhook | BillingUnavailable>;
  }
>()("tranzfer/Billing") {
  static readonly layer = (options: {
    readonly access: Effect.Success<typeof polarAccess>;
    readonly appUrl: string;
    /** Polar product ids by plan; binding values, so read per call. */
    readonly products: Effect.Effect<Readonly<Record<PaidPlanId, string>>>;
    readonly webhookSecret: Effect.Effect<Redacted.Redacted>;
  }) =>
    Layer.effect(
      Billing,
      Effect.gen(function* makeBilling() {
        const { db } = yield* Database;
        const deliveries = yield* Deliveries;
        const client = polarClient(options.access);

        // Polar answers with its own error classes; callers get one typed failure.
        const viaPolar = <A, E extends { readonly _tag: string }>(
          effect: Effect.Effect<A, E, Polar.PolarOpContext>,
        ) =>
          effect.pipe(
            Effect.provide(client),
            Effect.tapError((error) => Effect.logError("polar request failed", error._tag)),
            Effect.mapError(() => new BillingUnavailable()),
          );

        const row = (userId: string) => db.query.subscription.findFirst({ where: { userId } });

        const portal = Effect.fn("Billing.portal")(function* portal(userId: string) {
          const session = yield* viaPolar(
            Polar.customerSessionsCreate({
              body: { external_customer_id: userId, return_url: `${options.appUrl}/deliveries` },
            }),
          );
          return { url: session.customer_portal_url };
        });

        /** Replaces the user's row with what Polar says now, so replays and reordering converge. */
        const reconcile = Effect.fn("Billing.reconcile")(function* reconcile(userId: string) {
          const products = yield* options.products;
          const state = yield* viaPolar(
            Polar.customersGetStateExternal({ external_id: userId }).pipe(
              Effect.map(Option.some),
              Effect.catchTag("NotFound", () => Effect.succeedNone),
            ),
          );
          const owned = highestFirst.flatMap((plan) =>
            Option.match(state, {
              onNone: () => [],
              onSome: ({ active_subscriptions }) =>
                active_subscriptions
                  .filter((subscription) => subscription.product_id === products[plan])
                  .map((subscription) => ({ plan, subscription })),
            }),
          );
          const best = Arr.head(owned);
          const now = yield* Clock.currentTimeMillis;
          const next = {
            cancelAtPeriodEnd: Option.exists(
              best,
              ({ subscription }) => subscription.cancel_at_period_end,
            ),
            currentPeriodEnd: Option.map(
              best,
              ({ subscription }) => new Date(subscription.current_period_end),
            ).pipe(Option.getOrNull),
            plan: Option.match(best, { onNone: (): PlanId => "free", onSome: ({ plan }) => plan }),
            polarCustomerId: Option.map(state, ({ id }) => id).pipe(Option.getOrNull),
            polarSubscriptionId: Option.map(best, ({ subscription }) => subscription.id).pipe(
              Option.getOrNull,
            ),
            status: Option.match(best, {
              onNone: () => "none" as const,
              onSome: ({ subscription }) => subscription.status,
            }),
            updatedAt: new Date(now),
          };
          yield* db
            .insert(schema.subscription)
            .values({ userId, ...next })
            .onConflictDoUpdate({ set: next, target: schema.subscription.userId });
        }, dieOnDatabaseError);

        return Billing.of({
          checkout: Effect.fn("Billing.checkout")(function* checkout(
            user: Principal,
            plan: PaidPlanId,
          ) {
            const current = yield* row(user.id).pipe(dieOnDatabaseError);
            if (current !== undefined && current.plan !== "free") {
              return yield* portal(user.id);
            }
            const products = yield* options.products;
            const created = yield* viaPolar(
              Polar.checkoutsCreate({
                customer_email: user.email,
                external_customer_id: user.id,
                products: [products[plan]],
                return_url: `${options.appUrl}/`,
                success_url: `${options.appUrl}/deliveries?checkout=success`,
              }),
            );
            return { url: created.url };
          }),

          portal,

          summary: Effect.fn("Billing.summary")(function* summary(userId: string) {
            const current = yield* row(userId);
            const plan = current?.plan ?? "free";
            return {
              cancelsAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
              limitBytes: plans[plan].activeBytes,
              maxRetentionDays: plans[plan].maxRetentionDays,
              periodEnd: current?.currentPeriodEnd ?? null,
              plan,
              status: current?.status ?? "none",
              usedBytes: yield* deliveries.activeBytes(userId),
            };
          }, dieOnDatabaseError),

          webhook: Effect.fn("Billing.webhook")(function* webhook(
            headers: Readonly<Record<string, string | undefined>>,
            body: string,
          ) {
            yield* verifyWebhook(yield* options.webhookSecret, headers, body);
            const event = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(WebhookEvent))(
              body,
            ).pipe(Effect.mapError(() => new InvalidWebhook({ reason: "payload" })));
            const userId = event.data.customer.external_id;
            if (userId === null) {
              return;
            }
            // A customer made outside the app, or one for a deleted account.
            const user = yield* db.query.user
              .findFirst({ columns: { id: true }, where: { id: userId } })
              .pipe(dieOnDatabaseError);
            if (user === undefined) {
              return;
            }
            yield* reconcile(userId);
          }),
        });
      }),
    );
}

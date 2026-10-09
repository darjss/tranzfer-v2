import * as Polar from "@distilled.cloud/polar";
import { BillingUnavailable, plans } from "@tranzfer/contracts";
import type {
  BillingSummary,
  PaidPlanId,
  PlanId,
  Principal,
  SubscriptionStatus,
} from "@tranzfer/contracts";
import { Database, dieOnDatabaseError, schema } from "@tranzfer/db";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { Base64 } from "effect/encoding";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { Deliveries } from "./deliveries";
import { polarClient } from "./infrastructure/polar";
import type { polarAccess } from "./infrastructure/polar";
import { Plans } from "./plans";

/** The delivery is not from Polar: a missing header, a stale timestamp or a bad signature. */
export class InvalidWebhook extends Data.TaggedError("InvalidWebhook")<{
  readonly reason: "disabled" | "headers" | "payload" | "signature" | "timestamp";
}> {}

// Standard Webhooks allows five minutes of clock skew either way.
const TOLERANCE_SECONDS = 300;

/**
 * Checks a Polar delivery against Standard Webhooks. The HMAC key is the
 * base64 after the secret's `whsec_` prefix: Polar signs that way for every
 * endpoint created since 2026-09-08 (polarsource/polar
 * `server/polar/webhook/constants.py`), and ours are all newer.
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
  const keyBytes = yield* Effect.orDie(
    Effect.fromResult(Base64.decode(Redacted.value(secret).replace(/^whsec_/u, ""))),
  );
  const encoder = new TextEncoder();
  const key = yield* Effect.promise(
    async () =>
      await crypto.subtle.importKey("raw", keyBytes, { hash: "SHA-256", name: "HMAC" }, false, [
        "verify",
      ]),
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

// Stale rows reconciled per sweep, and the pause before a row is tried again.
const STALE_BATCH = 20;
const STALE_RETRY = Duration.minutes(15);

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
    /** Refetches Polar state for rows past their period end. Returns how many it tried. */
    readonly reconcileStale: Effect.Effect<number>;
    /** Verifies a Polar delivery and refreshes the user it names. */
    readonly webhook: (
      headers: Readonly<Record<string, string | undefined>>,
      body: string,
    ) => Effect.Effect<void, InvalidWebhook | BillingUnavailable>;
  }
>()("tranzfer/Billing") {
  static readonly layer = (options: {
    readonly appUrl: string;
    /**
     * Polar for this stage. None where paid plans are not open (see
     * `paidPlansOpen`): nothing calls Polar, checkout and the portal fail
     * with `notOpen` and webhooks with `disabled`.
     */
    readonly polar: Option.Option<{
      readonly access: Effect.Success<typeof polarAccess>;
      /** Polar product ids by plan; binding values, so read per call. */
      readonly products: Effect.Effect<Readonly<Record<PaidPlanId, string>>>;
      /** Fails with `disabled` on stages that have no webhook endpoint. */
      readonly webhookSecret: Effect.Effect<Redacted.Redacted, InvalidWebhook>;
      /** Stages without a webhook read Polar whenever the summary is read. */
      readonly reconcileOnRead: boolean;
    }>;
  }) =>
    Layer.effect(
      Billing,
      Effect.gen(function* makeBilling() {
        const { db } = yield* Database;
        const deliveries = yield* Deliveries;
        const userPlans = yield* Plans;
        const polarContext = yield* Effect.transposeOption(
          Option.map(options.polar, ({ access }) => Layer.build(polarClient(access))),
        );
        const notOpen = Effect.fail(new BillingUnavailable({ reason: "notOpen" }));

        // Polar answers with its own error classes; callers get one typed failure.
        const viaPolar = <A, E extends { readonly _tag: string }>(
          effect: Effect.Effect<A, E, Polar.PolarOpContext>,
        ) =>
          Option.match(polarContext, {
            onNone: () => notOpen,
            onSome: (context) =>
              effect.pipe(
                Effect.provideContext(context),
                Effect.tapError((error) => Effect.logError("polar request failed", error._tag)),
                Effect.mapError(() => new BillingUnavailable({ reason: "provider" })),
              ),
          });
        const products = Option.match(options.polar, {
          onNone: () => notOpen,
          onSome: (polar) => polar.products,
        });

        const row = (userId: string) => db.query.subscription.findFirst({ where: { userId } });

        const portal = Effect.fn("Billing.portal")(function* portal(userId: string) {
          const session = yield* viaPolar(
            Polar.customerSessionsCreate({
              body: { external_customer_id: userId, return_url: `${options.appUrl}/deliveries` },
            }),
          );
          return { url: session.customer_portal_url };
        });

        /**
         * Replaces the user's row with what Polar says now, so replays and
         * reordering converge. The customer state only lists active and
         * trialing subscriptions, so this reads the subscription list, which
         * keeps `past_due` visible. A subscription grants its plan while it is
         * active, trialing or past due (Polar retries the charge), and when
         * canceled until its paid period ends. Revoked, unpaid, paused and
         * incomplete ones grant nothing. A comp row is never overwritten.
         */
        const reconcile = Effect.fn("Billing.reconcile")(function* reconcile(userId: string) {
          const current = yield* row(userId);
          if (current?.status === "comp") {
            return;
          }
          const ids = yield* products;
          const subscriptions = yield* viaPolar(
            Polar.subscriptionsList
              .items({ external_customer_id: userId, limit: 100 })
              .pipe(Stream.runCollect),
          );
          const now = yield* Clock.currentTimeMillis;
          // The status a subscription is stored under, or none when it grants nothing.
          const granted = (subscription: Polar.Subscription) =>
            Match.value(subscription.status).pipe(
              Match.whenOr("active", "trialing", "past_due", (status) => Option.some(status)),
              Match.when("canceled", (status) =>
                new Date(subscription.current_period_end).getTime() > now
                  ? Option.some(status)
                  : Option.none(),
              ),
              Match.orElse(() => Option.none()),
            );
          const owned = highestFirst.flatMap((plan) =>
            subscriptions.flatMap((subscription) =>
              subscription.product_id === ids[plan]
                ? Option.match(granted(subscription), {
                    onNone: () => [],
                    onSome: (status) => [{ plan, status, subscription }],
                  })
                : [],
            ),
          );
          const best = Arr.head(owned);
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
            polarCustomerId: Option.map(
              Arr.head(subscriptions),
              (subscription) => subscription.customer_id,
            ).pipe(Option.getOrNull),
            polarSubscriptionId: Option.map(best, ({ subscription }) => subscription.id).pipe(
              Option.getOrNull,
            ),
            status: Option.match(best, {
              onNone: (): SubscriptionStatus => "none",
              onSome: ({ status }) => status,
            }),
            updatedAt: new Date(now),
          };
          yield* db
            .insert(schema.subscription)
            .values({ userId, ...next })
            .onConflictDoUpdate({ set: next, target: schema.subscription.userId });
        }, dieOnDatabaseError);

        /** Rows whose paid period has ended are the ones a lost webhook would strand. */
        const reconcileStale = Effect.fn("Billing.reconcileStale")(function* reconcileStale() {
          const now = yield* Clock.currentTimeMillis;
          const stale = yield* db.query.subscription
            .findMany({
              columns: { userId: true },
              limit: STALE_BATCH,
              orderBy: { currentPeriodEnd: "asc" },
              where: {
                currentPeriodEnd: { lte: new Date(now) },
                // Reconciling stamps updatedAt, so a row that stays past its
                // period end (a failing charge) is retried every few minutes,
                // not every run.
                updatedAt: { lte: new Date(now - Duration.toMillis(STALE_RETRY)) },
              },
            })
            .pipe(dieOnDatabaseError);
          yield* Effect.forEach(stale, ({ userId }) => Effect.ignore(reconcile(userId)), {
            discard: true,
          });
          return stale.length;
        });

        return Billing.of({
          checkout: Effect.fn("Billing.checkout")(function* checkout(
            user: Principal,
            plan: PaidPlanId,
          ) {
            const current = yield* row(user.id).pipe(dieOnDatabaseError);
            if (current !== undefined && current.plan !== "free") {
              return yield* portal(user.id);
            }
            const ids = yield* products;
            const created = yield* viaPolar(
              Polar.checkoutsCreate({
                customer_email: user.email,
                external_customer_id: user.id,
                products: [ids[plan]],
                return_url: `${options.appUrl}/`,
                success_url: `${options.appUrl}/deliveries?checkout=success`,
              }),
            );
            return { url: created.url };
          }),

          portal,

          reconcileStale: reconcileStale(),

          summary: Effect.fn("Billing.summary")(function* summary(userId: string) {
            if (Option.exists(options.polar, (polar) => polar.reconcileOnRead)) {
              yield* Effect.ignore(reconcile(userId));
            }
            const current = yield* row(userId);
            const { grantEndsAt, plan } = yield* userPlans.current(userId);
            return {
              cancelsAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
              grantEndsAt,
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
            const secret = yield* Option.match(options.polar, {
              onNone: () => Effect.fail(new InvalidWebhook({ reason: "disabled" })),
              onSome: (polar) => polar.webhookSecret,
            });
            yield* verifyWebhook(secret, headers, body);
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

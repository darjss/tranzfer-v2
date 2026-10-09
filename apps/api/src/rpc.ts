import {
  Api,
  Authenticated,
  AuthenticationUnavailable,
  CurrentPrincipal,
  Unauthorized,
} from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpEffect from "effect/http/HttpEffect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { Billing } from "./billing";
import { Auth } from "./infrastructure/auth";
import { Deliveries } from "./deliveries";
import { Plans } from "./plans";
import { SharedLinks } from "./shared-links";
import { Transfers } from "./transfers";

export const AuthenticatedLive = Layer.effect(
  Authenticated,
  Effect.gen(function* makeAuthenticated() {
    const auth = yield* Auth;
    return Authenticated.of((effect, { headers }) =>
      auth.session(new Headers(headers)).pipe(
        Effect.tapError(() => Effect.logError("session lookup failed")),
        Effect.mapError(() => new AuthenticationUnavailable()),
        Effect.tap(({ cookies }) =>
          HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(HttpServerResponse.mergeCookies(response, cookies)),
          ),
        ),
        Effect.flatMap(({ principal }) =>
          Option.match(principal, {
            onNone: () => Effect.fail(new Unauthorized()),
            onSome: (value) => effect.pipe(Effect.provideService(CurrentPrincipal, value)),
          }),
        ),
      ),
    );
  }),
);

/** Transport only: read the caller, hand the payload to a service. */
export const ApiHandlers = Api.toLayer(
  Effect.gen(function* makeHandlers() {
    const deliveries = yield* Deliveries;
    const transfers = yield* Transfers;
    const links = yield* SharedLinks;
    const billing = yield* Billing;
    const userPlans = yield* Plans;
    const sender = Effect.map(CurrentPrincipal, ({ id }) => id);
    return Api.of({
      CancelDelivery: ({ deliveryId }) =>
        Effect.flatMap(sender, (id) => deliveries.cancel(id, deliveryId)),
      ClearDeliveries: ({ deliveryIds }) =>
        Effect.flatMap(sender, (id) => deliveries.clear(id, deliveryIds)),
      CreateDelivery: (input) => Effect.flatMap(sender, (id) => deliveries.create(id, input)),
      Deliveries: () => Effect.flatMap(sender, deliveries.list),
      FinalizeTransfer: ({ transferId }) =>
        Effect.flatMap(sender, (id) => transfers.finalize(id, transferId)),
      GetBilling: () => Effect.flatMap(sender, billing.summary),
      Me: () => Effect.service(CurrentPrincipal),
      OpenBillingPortal: () => Effect.flatMap(sender, billing.portal),
      OpenLink: ({ token }) => links.open(token),
      RedeemCode: ({ code }) => Effect.flatMap(sender, (id) => userPlans.redeem(id, code)),
      SignUpload: ({ key, request }) =>
        Effect.flatMap(sender, (id) => transfers.sign(id, key, request)),
      StartCheckout: ({ plan }) =>
        Effect.flatMap(Effect.service(CurrentPrincipal), (user) => billing.checkout(user, plan)),
    });
  }),
);

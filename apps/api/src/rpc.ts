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
import { Auth, clientIp } from "./infrastructure/auth";
import { Deliveries } from "./deliveries";
import { Emails } from "./emails";
import { FileRequests } from "./file-requests";
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
    const emails = yield* Emails;
    const requests = yield* FileRequests;
    const auth = yield* Auth;
    const sender = Effect.map(CurrentPrincipal, ({ id }) => id);
    return Api.of({
      CancelDelivery: ({ deliveryId }) =>
        Effect.flatMap(sender, (id) => deliveries.cancel(id, deliveryId)),
      ClearDeliveries: ({ deliveryIds }) =>
        Effect.flatMap(sender, (id) => deliveries.clear(id, deliveryIds)),
      CloseFileRequest: ({ requestId }) =>
        Effect.flatMap(sender, (id) => requests.close(id, requestId)),
      CreateDelivery: (input) => Effect.flatMap(sender, (id) => deliveries.create(id, input)),
      CreateFileRequest: (input) => Effect.flatMap(sender, (id) => requests.create(id, input)),
      CreateRequestUpload: (input, { headers }) =>
        requests.receive(input, clientIp(new Headers(headers))),
      Deliveries: () => Effect.flatMap(sender, deliveries.list),
      DeliveryEmails: ({ deliveryId }) =>
        Effect.flatMap(sender, (id) => emails.deliveryEmails(id, deliveryId)),
      FileRequests: () => Effect.flatMap(sender, requests.list),
      FinalizeRequestTransfer: ({ token, transferId }, { headers }) =>
        requests.finalize(token, clientIp(new Headers(headers)), transferId),
      FinalizeTransfer: ({ transferId }) =>
        Effect.flatMap(sender, (id) => transfers.finalize(id, transferId)),
      GetBilling: () => Effect.flatMap(sender, billing.summary),
      // Without an email the signed-in account's address is used, so a
      // signed-in visitor joins in one click.
      JoinInterest: ({ email, plan }, { headers }) =>
        Effect.gen(function* joinInterest() {
          const who =
            email === undefined
              ? yield* auth.session(new Headers(headers)).pipe(
                  Effect.mapError(() => new AuthenticationUnavailable()),
                  Effect.flatMap(({ principal }) =>
                    Option.match(principal, {
                      onNone: () => Effect.fail(new Unauthorized()),
                      onSome: (user) => Effect.succeed({ email: user.email, userId: user.id }),
                    }),
                  ),
                )
              : { email, userId: null };
          return yield* emails.joinInterest({ ...who, plan }, clientIp(new Headers(headers)));
        }),
      Me: () => Effect.service(CurrentPrincipal),
      OpenBillingPortal: () => Effect.flatMap(sender, billing.portal),
      OpenFileRequest: ({ token }, { headers }) =>
        requests.open(token, clientIp(new Headers(headers))),
      OpenLink: ({ token, unlock }) => links.open(token, unlock),
      RedeemCode: ({ code }) => Effect.flatMap(sender, (id) => userPlans.redeem(id, code)),
      ReportDownload: ({ event, path, token, unlock }) => links.report(token, path, event, unlock),
      RequestUploads: ({ deliveryIds, token }, { headers }) =>
        requests.uploads(token, clientIp(new Headers(headers)), deliveryIds),
      SendDeliveryEmail: (input) =>
        Effect.flatMap(Effect.service(CurrentPrincipal), (user) =>
          emails.sendDelivery(user, input),
        ),
      SetLinkPassword: ({ deliveryId, password }) =>
        Effect.flatMap(sender, (id) => deliveries.setPassword(id, deliveryId, password)),
      SignRequestUpload: ({ key, request, token }, { headers }) =>
        requests.sign(token, clientIp(new Headers(headers)), key, request),
      SignUpload: ({ key, request }) =>
        Effect.flatMap(sender, (id) => transfers.sign(id, key, request)),
      StartCheckout: ({ plan }) =>
        Effect.flatMap(Effect.service(CurrentPrincipal), (user) => billing.checkout(user, plan)),
      UnlockLink: ({ password, token }, { headers }) =>
        links.unlock(token, password, clientIp(new Headers(headers))),
      UpdateDelivery: ({ deliveryId, note, title }) =>
        Effect.flatMap(sender, (id) => deliveries.update(id, deliveryId, { note, title })),
    });
  }),
);

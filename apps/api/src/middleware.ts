import {
  Authenticated,
  AuthenticationUnavailable,
  CurrentPrincipal,
  Unauthorized,
} from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { Auth } from "./services/auth";

export const AuthenticatedLive = Layer.effect(
  Authenticated,
  Effect.gen(function* makeAuthenticated() {
    const auth = yield* Auth;
    return Authenticated.of((effect, { headers }) =>
      auth.session(new Headers(headers)).pipe(
        Effect.tapError(Effect.logError),
        Effect.mapError(
          () =>
            new AuthenticationUnavailable({ message: "Unable to check your session. Try again." }),
        ),
        Effect.tap(({ cookies }) =>
          HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(HttpServerResponse.mergeCookies(response, cookies)),
          ),
        ),
        Effect.map(({ principal }) => principal),
        Effect.flatMap(
          Option.match({
            onNone: () => new Unauthorized({ message: "authentication required" }),
            onSome: (principal) => effect.pipe(Effect.provideService(CurrentPrincipal, principal)),
          }),
        ),
      ),
    );
  }),
);

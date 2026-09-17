import { Authenticated, CurrentPrincipal, Unauthorized } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Auth } from "./services/auth";

export const AuthenticatedLive = Layer.effect(
  Authenticated,
  Effect.gen(function* makeAuthenticated() {
    const auth = yield* Auth;
    return Authenticated.of((effect, { headers }) =>
      auth.session(new Headers(headers)).pipe(
        Effect.mapError(() => new Unauthorized({ message: "session lookup failed" })),
        Effect.flatMap(
          Option.match({
            onNone: () => new Unauthorized({ message: "authentication required" }),
            onSome: (principal) => effect.pipe(Effect.provideService(CurrentPrincipal, principal)),
          }),
        ),
      ),
    );
  }),
).pipe(Layer.provide(Auth.layer));

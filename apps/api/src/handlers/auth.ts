import { Api, CurrentPrincipal } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";

export const AuthHandlers = Api.toLayerHandler(
  "Me",
  Effect.fn("AuthHandlers.Me")(function* me() {
    return yield* CurrentPrincipal;
  }),
);

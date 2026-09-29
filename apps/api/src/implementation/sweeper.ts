import * as Effect from "effect/Effect";

import { Deliveries } from "./deliveries";
import { Transfers } from "./transfers";

/** Background upkeep the requests can't be trusted to finish. Every step is idempotent. */
export const sweep = Effect.gen(function* sweep() {
  const deliveries = yield* Deliveries;
  const transfers = yield* Transfers;
  const [recovered, purged] = yield* Effect.all(
    [transfers.recoverFinalizing, deliveries.purgeEnded],
    { concurrency: 2 },
  );
  if (recovered + purged > 0) {
    yield* Effect.logInfo("sweep", { purged, recovered });
  }
}).pipe(Effect.withSpan("sweep"));

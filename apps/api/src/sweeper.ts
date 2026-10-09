import * as Effect from "effect/Effect";

import { Billing } from "./billing";
import { Deliveries } from "./deliveries";
import { Transfers } from "./transfers";

/** Background upkeep the requests can't be trusted to finish. Every step is idempotent. */
export const sweep = Effect.gen(function* sweep() {
  const deliveries = yield* Deliveries;
  const transfers = yield* Transfers;
  const billing = yield* Billing;
  const [recovered, purged, reconciled] = yield* Effect.all(
    [transfers.recoverFinalizing, deliveries.purgeEnded, billing.reconcileStale],
    { concurrency: 3 },
  );
  if (recovered + purged + reconciled > 0) {
    yield* Effect.logInfo("sweep", { purged, reconciled, recovered });
  }
}).pipe(Effect.withSpan("sweep"));

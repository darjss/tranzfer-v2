import * as Effect from "effect/Effect";

import { Billing } from "./billing";
import { Deliveries } from "./deliveries";
import { Emails } from "./emails";
import { Transfers } from "./transfers";

/** Background upkeep the requests can't be trusted to finish. Every step is idempotent. */
export const sweep = Effect.gen(function* sweep() {
  const deliveries = yield* Deliveries;
  const transfers = yield* Transfers;
  const billing = yield* Billing;
  const emails = yield* Emails;
  const [recovered, purged, reconciled, announced] = yield* Effect.all(
    [
      transfers.recoverFinalizing,
      deliveries.purgeEnded,
      billing.reconcileStale,
      emails.sendOpenings,
    ],
    { concurrency: 4 },
  );
  if (recovered + purged + reconciled + announced > 0) {
    yield* Effect.logInfo("sweep", { announced, purged, reconciled, recovered });
  }
}).pipe(Effect.withSpan("sweep"));

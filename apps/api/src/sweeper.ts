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
  const [recovered, purged, reconciled, announced, lost] = yield* Effect.all(
    [
      transfers.recoverFinalizing,
      deliveries.purgeEnded,
      billing.reconcileStale,
      emails.sendOpenings,
      emails.failLost,
    ],
    { concurrency: 4 },
  );
  if (recovered + purged + reconciled + announced + lost > 0) {
    yield* Effect.logInfo("sweep", { announced, lost, purged, reconciled, recovered });
  }
}).pipe(Effect.withSpan("sweep"));

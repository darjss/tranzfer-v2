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
  // A failed job must not interrupt unrelated upkeep. Keep the failure visible
  // after every job finishes; writes with an unknown outcome are not retried.
  const results = yield* Effect.all(
    [
      transfers.recoverFinalizing,
      deliveries.purgeEnded,
      billing.reconcileStale,
      emails.sendOpenings,
    ].map(Effect.exit),
    { concurrency: 4 },
  );
  const [recovered, purged, reconciled, announced] = yield* Effect.all(results);
  if (recovered + purged + reconciled + announced > 0) {
    yield* Effect.logInfo("sweep", { announced, purged, reconciled, recovered });
  }
}).pipe(Effect.withSpan("sweep"));

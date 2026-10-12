import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";

import { Billing } from "./billing";
import { Deliveries } from "./deliveries";
import { Emails } from "./emails";
import { Transfers } from "./transfers";

// One step's failure must not cancel the others; the next minute retries it.
// Interruption (isolate shutdown) still propagates. The cause can carry SQL
// parameters, so only the step and the error's name are logged.
const isolated = (step: string, effect: Effect.Effect<number>) =>
  effect.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) => {
        const error = Cause.squash(cause);
        return Effect.logError("sweep step failed", {
          error: error instanceof Error ? error.name : "unknown",
          step,
        }).pipe(Effect.as(0));
      },
    ),
  );

/** Background upkeep the requests can't be trusted to finish. Every step is idempotent. */
export const sweep = Effect.gen(function* sweep() {
  const deliveries = yield* Deliveries;
  const transfers = yield* Transfers;
  const billing = yield* Billing;
  const emails = yield* Emails;
  const [recovered, purged, reconciled, announced, lost] = yield* Effect.all(
    [
      isolated("recoverFinalizing", transfers.recoverFinalizing),
      isolated("purgeEnded", deliveries.purgeEnded),
      isolated("reconcileStale", billing.reconcileStale),
      isolated("sendOpenings", emails.sendOpenings),
      isolated("failLost", emails.failLost),
    ],
    { concurrency: 4 },
  );
  if (recovered + purged + reconciled + announced + lost > 0) {
    yield* Effect.logInfo("sweep", { announced, lost, purged, reconciled, recovered });
  }
}).pipe(Effect.withSpan("sweep"));

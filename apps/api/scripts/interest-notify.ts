// Queues the "plan is open" email for everyone on a plan's interest list who
// hasn't had it, in a stage's D1 (see ./stage). The API Worker's minute sweep
// sends the queue and sets notified_at. docs/PRODUCT.md "When paid plans
// open" has the command.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PaidPlanId } from "@tranzfer/contracts";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { queueOpenings } from "../src/emails";
import { onStage, stageFlag } from "./stage";

const notify = Command.make(
  "interest-notify",
  {
    dryRun: Flag.Boolean("dry-run").pipe(Flag.withDescription("Only count; queue nothing")),
    plan: Flag.Literals("plan", PaidPlanId.literals),
    stage: stageFlag,
  },
  Effect.fn("interest.notify")(function* notify({ dryRun, plan, stage }) {
    const { queued, waiting } = yield* onStage(stage, queueOpenings(plan, { dryRun }));
    yield* Console.log(`${stage}: ${waiting} on the ${plan} list have not had the opening email.`);
    yield* Console.log(
      dryRun
        ? "Dry run: nothing queued."
        : `Queued ${queued}. The API sends 20 a minute; run this again to retry any that fail.`,
    );
  }),
).pipe(Command.withDescription("Queue the email that tells a plan's interest list it opened"));

NodeRuntime.runMain(
  Command.runWith(notify, { version: "0.0.0" })(
    // `vp run interest:notify -- --plan …` passes the `--` through.
    process.argv.slice(2).filter((arg) => arg !== "--"),
  ).pipe(Effect.provide(NodeServices.layer)),
);

// What the admin scripts share: the --stage flag and running an Effect
// against that stage's App database. Alchemy finds the database in the
// stack's state and queries it over the D1 HTTP API with your Alchemy
// profile's Cloudflare credentials.
import { Database } from "@tranzfer/db";
import * as Alchemy from "alchemy";
import { makeCaptureContext, makeResolveContext } from "alchemy/ActionRuntimeContext";
import * as Alchemist from "alchemy/Alchemist";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { RuntimeContext } from "alchemy/RuntimeContext";
import { evalStack } from "alchemy/Stack";
import { State } from "alchemy/State";
import * as Flag from "effect/cli/Flag";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

// The stack in infra/alchemy.run.ts and the stages it deploys.
const STACK = "tranzfer";
export const stageFlag = Flag.String("stage").pipe(
  Flag.withSchema(
    Schema.String.check(
      Schema.isPattern(/^(?:production|staging|pr-\d+|dev_\w+)$/u, {
        expected: "production, staging, pr-<number> or dev_<user>",
      }),
    ),
  ),
  Flag.withDefault("production"),
  Flag.withDescription("The stage whose database to use"),
);

// Only the providers and state store the stack uses; nothing here plans or
// deploys.
const admin = Alchemy.Stack(
  STACK,
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.succeed({}),
);

/** The stage's App database (apps/api/src/resources.ts), as the API's `Database`. */
const appDatabase = (stage: string) =>
  Layer.unwrap(
    Effect.gen(function* resolveAppDatabase() {
      const app = yield* Cloudflare.D1.Database.ref("App", { stack: STACK, stage });
      // QueryDatabaseLocal reads the database id as an Output, the way an
      // Action does during a deploy: captured first, then resolved, here
      // from the stack's state.
      const captures: Record<string, Output.Output<unknown, never>> = {};
      const client = yield* Cloudflare.D1.QueryDatabase(app).pipe(
        Effect.provide(Cloudflare.D1.QueryDatabaseLocal),
        Effect.provideService(RuntimeContext, makeCaptureContext(captures)),
      );
      const resolved = Object.fromEntries(
        yield* Effect.forEach(Object.entries(captures), ([key, output]) =>
          Effect.map(Output.evaluate(output, {}), (value) => [key, value] as const),
        ),
      );
      const d1 = yield* client.raw.pipe(
        Effect.provideService(RuntimeContext, makeResolveContext(resolved)),
      );
      return Database.fromD1(d1);
    }),
  );

// evalStack runs the effect with the stack's own services: the Cloudflare
// state store and credentials. Its type still asks for an outer State, which
// the stack's shadows, so that one only dies.
export const onStage = <A, E>(stage: string, effect: Effect.Effect<A, E, Database>) =>
  evalStack(admin, () => effect.pipe(Effect.provide(appDatabase(stage))), { stage }).pipe(
    Effect.provide(Alchemist.layer()),
    Effect.provideService(State, Effect.die(new Error("Expected the stack's own state store"))),
  );

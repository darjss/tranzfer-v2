// Creates, lists and revokes access codes in a stage's D1. Alchemy finds the
// stage's database in the stack's state and queries it over the D1 HTTP API
// with your Alchemy profile's Cloudflare credentials. docs/PRODUCT.md
// "Access codes" has the commands.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PaidPlanId } from "@tranzfer/contracts";
import { Database } from "@tranzfer/db";
import * as Alchemy from "alchemy";
import { makeCaptureContext, makeResolveContext } from "alchemy/ActionRuntimeContext";
import * as Alchemist from "alchemy/Alchemist";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { RuntimeContext } from "alchemy/RuntimeContext";
import { evalStack } from "alchemy/Stack";
import { State } from "alchemy/State";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  AccessCodeDay,
  createAccessCode,
  listAccessCodes,
  NewAccessCode,
  revokeAccessCode,
} from "../src/plans";

// The stack in infra/alchemy.run.ts and the stages it deploys.
const STACK = "tranzfer";
const stageFlag = Flag.String("stage").pipe(
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
const onStage = <A, E>(stage: string, effect: Effect.Effect<A, E, Database>) =>
  evalStack(admin, () => effect.pipe(Effect.provide(appDatabase(stage))), { stage }).pipe(
    Effect.provide(Alchemist.layer()),
    Effect.provideService(State, Effect.die(new Error("Expected the stack's own state store"))),
  );

const day = (date: Date) => date.toISOString().slice(0, 10);

const create = Command.make(
  "create",
  {
    code: Flag.String("code").pipe(
      Flag.withSchema(NewAccessCode.fields.code),
      Flag.withDescription("3 to 40 letters, digits or dashes, like BETA-PRO"),
    ),
    days: Flag.Int("days").pipe(
      Flag.withSchema(NewAccessCode.fields.days),
      Flag.withDescription("How long each grant lasts, 1 to 3650"),
    ),
    expires: Flag.String("expires").pipe(
      Flag.withSchema(AccessCodeDay),
      Flag.optional,
      Flag.withDescription("The last day it can be redeemed, in UTC, like 2026-12-31"),
    ),
    plan: Flag.Literals("plan", PaidPlanId.literals),
    stage: stageFlag,
    uses: Flag.Int("uses").pipe(
      Flag.withSchema(NewAccessCode.fields.maxUses),
      Flag.withDescription("How many users can redeem it"),
    ),
  },
  Effect.fn("codes.create")(function* create({ code, days, expires, plan, stage, uses }) {
    const created = yield* onStage(
      stage,
      createAccessCode({
        code,
        days,
        lastDay: Option.getOrUndefined(expires),
        maxUses: uses,
        plan,
      }),
    );
    const site = stage === "production" ? "https://tranzfer.app" : `https://${stage}.tranzfer.app`;
    yield* Console.log(
      `${stage}: created ${created.code}, ${created.plan} for ${created.days} days`,
    );
    yield* Console.log(`Invite link: ${site}/sign-in?code=${created.code}`);
  }),
).pipe(Command.withDescription("Add a code and print its invite link"));

const list = Command.make(
  "list",
  { stage: stageFlag },
  Effect.fn("codes.list")(function* list({ stage }) {
    const codes = yield* onStage(stage, listAccessCodes());
    yield* Console.log(`${stage}: ${codes.length} codes`);
    yield* Console.table(
      codes.map((code) => ({
        code: code.code,
        created: day(code.createdAt),
        days: code.days,
        // expires_at is the midnight after the last day.
        "last day": code.expiresAt === null ? "" : day(new Date(code.expiresAt.getTime() - 1)),
        plan: code.plan,
        uses: `${code.uses}/${code.maxUses}`,
      })),
    );
  }),
).pipe(Command.withDescription("List every code, newest first"));

const revoke = Command.make(
  "revoke",
  { code: Flag.String("code"), stage: stageFlag },
  Effect.fn("codes.revoke")(function* revoke({ code, stage }) {
    const revoked = yield* onStage(stage, revokeAccessCode(code));
    yield* Console.log(
      `${stage}: ${revoked.code} can no longer be redeemed. Its ${revoked.uses} grants keep their end dates.`,
    );
  }),
).pipe(Command.withDescription("End a live code now; grants already made keep their end"));

const codes = Command.make("codes").pipe(
  Command.withDescription("Create, list and revoke access codes on a stage"),
  Command.withSubcommands([create, list, revoke]),
);

NodeRuntime.runMain(
  Command.runWith(codes, { version: "0.0.0" })(
    // `vp run code:create -- --code …` passes the `--` through.
    process.argv.slice(2).filter((arg) => arg !== "--"),
  ).pipe(
    Effect.catchTags({
      AccessCodeExists: ({ code }) => Effect.fail(`${code} already exists; pick another code.`),
      AccessCodeNotLive: ({ code }) => Effect.fail(`No live code named ${code}.`),
    }),
    Effect.provide(NodeServices.layer),
  ),
);

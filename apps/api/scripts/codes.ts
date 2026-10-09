// Creates, lists and revokes access codes in a stage's D1 (see ./stage).
// docs/PRODUCT.md "Access codes" has the commands.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PaidPlanId } from "@tranzfer/contracts";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  AccessCodeDay,
  createAccessCode,
  listAccessCodes,
  NewAccessCode,
  revokeAccessCode,
} from "../src/plans";
import { onStage, stageFlag } from "./stage";

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

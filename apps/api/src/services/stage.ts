import { Stage } from "alchemy/Stage";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// PR preview stacks deploy as `pr-<number>` and behave like staging.
export const isPreviewStage = (stage: string) => /^pr-\d+$/u.test(stage);

// Inside the running Worker there is no Stage service; Alchemy binds
// ALCHEMY_STAGE as a plain_text binding and we read that instead. Unknown
// stages die so a typo can never ship the staging login to a real stage.
// `alchemy dev` names local stages `dev_<user>`.
export const deployStage = Effect.serviceOption(Stage).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Config.String("ALCHEMY_STAGE"),
      onSome: (stage) => Effect.succeed(stage),
    }),
  ),
  Effect.orDie,
  Effect.flatMap((stage) => {
    if (stage === "production") {
      return Effect.succeed("production" as const);
    }
    if (stage === "staging" || isPreviewStage(stage)) {
      return Effect.succeed("staging" as const);
    }
    if (stage.startsWith("dev_")) {
      return Effect.succeed("dev" as const);
    }
    return Effect.die(
      new Error(
        `Unknown stage "${stage}"; expected production, staging, pr-<number> or dev_<user>`,
      ),
    );
  }),
);

import { Stage } from "alchemy/Stage";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// Inside the running Worker there is no Stage service; Alchemy binds
// ALCHEMY_STAGE as a plain_text binding and we read that instead.
export const deployStage = Effect.serviceOption(Stage).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Config.option(Config.String("ALCHEMY_STAGE")),
      onSome: (stage) => Effect.succeed(Option.some(stage)),
    }),
  ),
  Effect.map((stage) =>
    Option.isSome(stage) && (stage.value === "production" || stage.value === "staging")
      ? stage.value
      : "dev",
  ),
);

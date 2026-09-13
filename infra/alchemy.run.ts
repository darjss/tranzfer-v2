import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

// Workers, R2, and D1 are added in foundation step 4. This file exists so
// infra is a real Alchemy program from the start, not an empty folder.
export default Alchemy.Stack(
  "tranzfer",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.succeed({}),
);

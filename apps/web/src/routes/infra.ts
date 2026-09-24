import * as Effect from "effect/Effect";

import { apiOverBinding } from "../api/binding";

export const GET = async () => {
  const { client, runtime } = apiOverBinding();
  return Response.json({
    web: true,
    ...(await runtime.runPromise(
      Effect.gen(function* infraProbe() {
        const health = yield* client.Health();
        const bindings = yield* client
          .Infra()
          .pipe(
            Effect.catchTag("ProbeFailed", (error) =>
              Effect.succeed({ d1: false, probeFailed: error.resource, r2: false, s3: false }),
            ),
          );
        return { bindings, health };
      }),
    )),
  });
};

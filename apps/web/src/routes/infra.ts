import * as Effect from "effect/Effect";

import { apiOverBinding } from "../api/binding";

export const GET = async () => {
  const { client, runtime } = await apiOverBinding();
  const api = await runtime.runPromise(client.Health());
  const bindings = await runtime.runPromise(
    client
      .Infra()
      .pipe(
        Effect.catchTag("ProbeFailed", (error) =>
          Effect.succeed({ d1: false, probeFailed: error.resource, r2: false }),
        ),
      ),
  );
  return Response.json({ api, bindings, web: true });
};

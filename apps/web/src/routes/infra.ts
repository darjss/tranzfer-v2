import * as Effect from "effect/Effect";

import { makeApi } from "../api";

export const GET = async () => {
  // Lazy: the prerenderer imports the server bundle in Node, where
  // `cloudflare:workers` does not exist. Only workerd serves this route.
  const { env } = await import("cloudflare:workers");
  const { client, runtime } = makeApi(env.API.fetch.bind(env.API), "http://api/rpc");
  const api = await runtime.runPromise(client.Health());
  const bindings = await runtime.runPromise(
    client
      .Infra({ key: "infra-probe" })
      .pipe(
        Effect.catchTag("ProbeFailed", (error) =>
          Effect.succeed({ d1: false, probeFailed: error.resource, r2: false }),
        ),
      ),
  );
  return Response.json({ api, bindings, web: true });
};

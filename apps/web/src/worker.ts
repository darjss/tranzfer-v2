import * as Effect from "effect/Effect";
import { handleRequest } from "virtual:solid-ssr-handler";

import { makeApi } from "./api";

interface WebEnv {
  API?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: WebEnv) {
    const url = new URL(request.url);
    if (url.pathname === "/infra") {
      if (!env.API) {
        return Response.json({ api: null, web: true }, { status: 503 });
      }
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
      return Response.json({
        api,
        bindings,
        web: true,
      });
    }

    return await handleRequest(request);
  },
};

import { handleRequest } from "virtual:solid-ssr-handler";

type WebEnv = {
  API?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
};

export default {
  async fetch(request: Request, env: WebEnv) {
    const url = new URL(request.url);
    if (url.pathname === "/infra") {
      if (!env.API) {
        return Response.json({ web: true, api: null }, { status: 503 });
      }
      const health = await env.API.fetch(new URL("/health", request.url));
      const bindings = await env.API.fetch(new URL("/infra", request.url));
      return Response.json({
        web: true,
        api: await health.json(),
        bindings: await bindings.json(),
      });
    }

    return handleRequest(request);
  },
};

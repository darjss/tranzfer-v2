import { handleRequest } from "virtual:solid-ssr-handler";

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
      const healthResponse = await env.API.fetch(new URL("/health", request.url));
      const bindingsResponse = await env.API.fetch(new URL("/infra", request.url));
      const api: unknown = await healthResponse.json();
      const bindings: unknown = await bindingsResponse.json();
      return Response.json({
        api,
        bindings,
        web: true,
      });
    }

    return await handleRequest(request);
  },
};

import type { APIEvent } from "filesystem-routing/api";

// Browser spans forward to the API worker over the service binding, which
// holds the Axiom credentials. The `cloudflare:workers` import stays lazy: the
// prerenderer loads this module in Node where it doesn't exist.
export const POST = async (event: APIEvent) => {
  const { env } = await import("cloudflare:workers");
  return await env.API.fetch(event.request);
};

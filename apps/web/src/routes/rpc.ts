import type { APIEvent } from "filesystem-routing/api";

// Browser RPC calls forward to the API worker over the service binding; the
// api worker routes on the "/rpc" pathname. The `cloudflare:workers` import
// stays lazy: the prerenderer loads this module in Node where it doesn't
// exist.
export const POST = async (event: APIEvent) => {
  const { env } = await import("cloudflare:workers");
  return await env.API.fetch(event.request);
};

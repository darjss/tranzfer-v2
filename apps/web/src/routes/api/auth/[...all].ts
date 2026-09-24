import type { APIEvent } from "filesystem-routing/api";

// Browser auth calls forward to the API worker over the service binding; the
// api worker routes on the "/api/auth/" pathname prefix. The
// `cloudflare:workers` import stays lazy: the prerenderer loads this module
// in Node where it doesn't exist.
export const GET = async (event: APIEvent) => {
  const { env } = await import("cloudflare:workers");
  return await env.API.fetch(event.request);
};

export const POST = async (event: APIEvent) => {
  const { env } = await import("cloudflare:workers");
  return await env.API.fetch(event.request);
};

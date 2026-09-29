import type { APIEvent } from "filesystem-routing/api";

// The API's health check (D1 and R2 reachable), served on the web origin.
// `cloudflare:workers` stays lazy: the prerenderer loads this in Node.
export const GET = async (event: APIEvent) => {
  const { env } = await import("cloudflare:workers");
  return await env.API.fetch(event.request);
};

import { getRequestEvent } from "@solidjs/web";
import type { FetchMiddleware } from "@solidjs/web";
import routes from "virtual:file-routes";
import { createAPIHandler } from "filesystem-routing/api";

// Every response the Worker builds: SSR pages, /rpc and the other API routes.
// Prerendered pages skip the Worker; public/_headers repeats these for them.
// The event's response headers fold onto whatever the chain returns.
const securityHeaders: FetchMiddleware = async (_request, next) => {
  const headers = getRequestEvent()?.response.headers;
  headers?.set("X-Content-Type-Options", "nosniff");
  headers?.set("Content-Security-Policy", "frame-ancestors 'none'");
  headers?.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return await next();
};

export default [securityHeaders, createAPIHandler(routes)];

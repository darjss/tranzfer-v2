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
  // Report-only: the browser console lists violations and blocks nothing.
  // Hydration injects an inline script, so script-src is still open.
  headers?.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; img-src 'self' data: https://*.r2.cloudflarestorage.com; media-src 'self' blob: https://*.r2.cloudflarestorage.com; connect-src 'self' https://*.r2.cloudflarestorage.com; base-uri 'self'; form-action 'self'",
  );
  return await next();
};

export default [securityHeaders, createAPIHandler(routes)];

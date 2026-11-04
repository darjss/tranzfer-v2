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

// PostHog's Cloudflare proxy: first-party, so connect-src stays 'self' and
// blockers let it through. Scripts come from the assets host, events go to the
// ingest host. The client IP rides along for GeoIP; cookies stay here.
const posthogProxy: FetchMiddleware = async (request, next) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/ingest/")) {
    return await next();
  }
  const path = url.pathname.slice("/ingest".length);
  const host = path.startsWith("/static/") ? "us-assets.i.posthog.com" : "us.i.posthog.com";
  const upstream = new Request(`https://${host}${path}${url.search}`, request);
  upstream.headers.delete("cookie");
  const ip = request.headers.get("cf-connecting-ip");
  if (ip !== null) {
    upstream.headers.set("x-forwarded-for", ip);
  }
  return await fetch(upstream);
};

export default [posthogProxy, securityHeaders, createAPIHandler(routes)];

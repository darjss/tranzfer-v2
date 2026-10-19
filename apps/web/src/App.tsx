import { clientOnly, getRequestEvent, isServer } from "@solidjs/web";
import * as Layer from "effect/Layer";
import { Loading } from "solid-js";

import { WebLayer } from "./api/client";
import { onUnexpectedFailure, reportFailure } from "./api/errors";
import { createRuntime, RuntimeContext } from "./api/solid-effect";
import { Router } from "./router";
import { Uploads } from "./uploads/uploads";
import { UploadSpans } from "./uploads/spans";
// Self-hosted, so the first paint waits on no third-party stylesheet.
import "@fontsource-variable/archivo/wght.css";
import "@fontsource-variable/archivo/wght-italic.css";
import "@fontsource-variable/caveat/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./App.css";

// Notifications are browser-only; the server renders none.
const Toasts = clientOnly(async () => await import("./ui/Toasts"));

// The app root. Pages are the modules under src/routes; each owns its own
// chrome (the landing has its own nav) until there is a signed-in shell.
export default function App() {
  const event = getRequestEvent();
  // Only tranzfer.app belongs in search results; public/_headers covers the
  // prerendered pages, this covers everything the Worker renders. The build's
  // prerender crawls localhost, and its sitemap drops any page marked noindex.
  const host = event === undefined ? "" : new URL(event.request.url).hostname;
  if (event !== undefined && host !== "tranzfer.app" && host !== "localhost") {
    event.response.headers.set("X-Robots-Tag", "noindex");
  }
  // API reads run in the browser only; every page that reads is clientOnly.
  // The server builds the same runtime but never runs it, and layers build
  // on first use, so nothing browser-only executes in workerd.
  const runtime = createRuntime(
    Uploads.layer.pipe(Layer.provideMerge(UploadSpans.layer), Layer.provideMerge(WebLayer)),
  );
  if (!isServer) {
    // A message that says "Something went wrong" carries a reference; this
    // is the report that reference points to.
    onUnexpectedFailure((cause, traceId) => {
      runtime.runFork(reportFailure(cause, [], traceId));
    });
  }
  return (
    <RuntimeContext value={runtime}>
      <Router>{(props) => <Loading fallback={<main />}>{props.children}</Loading>}</Router>
      <Toasts />
    </RuntimeContext>
  );
}

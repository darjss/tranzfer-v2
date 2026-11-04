import * as Schema from "effect/Schema";
import posthog from "posthog-js";
import type { Properties } from "posthog-js";

// Link tokens ride in /d/<token> and /r/<token>; invite codes, OAuth state and
// signed storage URLs ride in the query. Every string PostHog sends passes here.
const scrub = (text: string) =>
  text
    .replaceAll(/\/([dr])\/[^/?#\s"'<>]+/gu, "/$1/:token")
    .replaceAll(/([?&](?:code|state|token|x-amz-[\w-]+)=)[^&#\s"'<>]*/giu, "$1:redacted");

// Scrubbing the serialized text reaches a URL wherever PostHog put it:
// $current_url, $initial_*, $session_entry_*, web vitals, exception messages.
const decodeProperties = Schema.decodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);
const scrubbed = (properties: Properties) => decodeProperties(scrub(JSON.stringify(properties)));

const host = location.hostname;
const live = host === "tranzfer.app" || host.endsWith(".tranzfer.app");

if (live) {
  // A public project key. /ingest is the web Worker's proxy (middleware.ts).
  posthog.init("phc_v4dprLKjoCdE2T36AwbM5PX3QhqxbGWAhMeZz42YYFZS", {
    // The flags request carries the first URL this browser saw, unscrubbed,
    // and nothing here reads a flag.
    advanced_disable_feature_flags: true,
    api_host: "/ingest",
    // Click capture records element text: file names and emails.
    autocapture: false,
    // Replay events pass as they are: the recorder hooks below mask their URLs
    // and attributes, and full snapshots are gzipped by the time they get here.
    before_send: (event) =>
      event.event === "$snapshot"
        ? event
        : {
            ...event,
            // On /d/ and /r/ the page title is the sender's own title, often
            // a file name. JSON drops the undefined key.
            properties: scrubbed({ ...event.properties, title: undefined }),
            ...(event.$set && { $set: scrubbed(event.$set) }),
            ...(event.$set_once && { $set_once: scrubbed(event.$set_once) }),
          },
    capture_exceptions: true,
    capture_heatmaps: false,
    defaults: "2026-08-30",
    // Before the initial pageview, so every event carries it.
    loaded: (instance) => {
      instance.register({ stage: host === "tranzfer.app" ? "production" : "staging" });
    },
    // The privacy policy promises no tracking cookies.
    persistence: "localStorage",
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true,
      maskAttributeFn: (_name, value) => scrub(value),
      // Also masks the page URLs replay records: meta events, $url_changed, $pageview.
      maskCapturedNetworkRequestFn: (request) => ({ ...request, name: scrub(request.name) }),
      maskTextSelector: "*",
    },
    ui_host: "https://us.posthog.com",
  });
}

// Undefined off tranzfer.app, so local dev sends nothing.
export const analytics = live ? posthog : undefined;

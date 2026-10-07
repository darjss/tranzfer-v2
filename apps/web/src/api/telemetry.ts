import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as OtlpExporter from "effect/observability/OtlpExporter";
import * as OtlpSerialization from "effect/observability/OtlpSerialization";
import * as OtlpTracer from "effect/observability/OtlpTracer";

// The page is hidden or leaving: whatever the tracer buffered goes out now.
// keepalive lets the request outlive the page, and its 64 KiB cap is why the
// batches stay small. A rejected export only disables the exporter for a
// minute (it logs at debug); nothing here reaches the app's own work.
const flushOnHide = Layer.effectDiscard(
  Effect.gen(function* flushOnHide() {
    const flusher = yield* OtlpExporter.Flusher;
    const run = yield* FiberSet.makeRuntime();
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        run(
          flusher.flush.pipe(
            Effect.provideService(FetchHttpClient.RequestInit, { keepalive: true }),
            Effect.timeoutOption("2 seconds"),
          ),
        );
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", onHide);
      }),
    );
  }),
);

/**
 * Browser spans, exported to the API worker's relay at the same origin. The
 * relay holds the Axiom token and sets the service name; nothing here can
 * reach Axiom or name its own dataset.
 */
export const BrowserTracing = flushOnHide.pipe(
  Layer.provideMerge(
    OtlpTracer.layer({
      exportInterval: "5 seconds",
      maxBatchSize: 50,
      resource: { serviceName: "tranzfer-web" },
      url: "/api/telemetry/traces",
    }),
  ),
  Layer.provide([OtlpSerialization.layerJson, FetchHttpClient.layer]),
);

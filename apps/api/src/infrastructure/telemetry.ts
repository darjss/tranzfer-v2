import * as Alchemy from "alchemy";
import * as Axiom from "alchemy/Axiom";
import { RuntimeContext } from "alchemy";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { Ingest, Logs, Traces } from "../resources";
import { deployStage } from "./stage";

// Response headers worth keeping on a span. Everything else can carry a
// credential (set-cookie, x-amz-security-token, signed redirects), so the
// default is to hide the value and keep the name.
const KEPT_HEADERS = new Set(["cf-ray", "content-length", "content-type"]);
const HEADER_ATTRIBUTE = /^http\.(?:request|response)\.header\.(?<name>.+)$/u;

/**
 * Effect's HTTP spans record the full URL, query string included, and every
 * header not on its short default redaction list. A query string can hold an
 * OAuth code or a signature, so neither the query nor the full URL leaves the
 * Worker. The path and host stay in `url.path` and `server.address`.
 */
export const isScrubbed = (key: string) => {
  const header = HEADER_ATTRIBUTE.exec(key)?.groups?.name;
  return header === undefined
    ? key === "url.query" || key === "url.full"
    : !KEPT_HEADERS.has(header);
};

// Wraps the tracer Alchemy builds from the bound Axiom destinations. The
// exporter ignores which tracer layer produced a span, so scrubbing at
// `attribute` covers the server spans, the HTTP client spans and our own.
const scrubbedTracer = Layer.effect(
  Tracer.Tracer,
  Effect.gen(function* scrubbedTracer() {
    const exporters = yield* Layer.build(yield* Alchemy.Telemetry.Telemetry);
    const inner = Context.get(exporters, Tracer.Tracer);
    return Tracer.make({
      context: inner.context,
      span(options) {
        const span = inner.span(options);
        const attribute = span.attribute.bind(span);
        // The span belongs to the exporter's tracer, so patching the one
        // method is the only seam between creating it and writing to it.
        span.attribute = (key, value) => {
          attribute(key, isScrubbed(key) ? "<redacted>" : value);
        };
        return span;
      },
    });
  }),
);

/**
 * Traces and logs to this stage's Axiom datasets. Dev stages ship nothing:
 * the Axiom resources would need org credentials just to run `vp run dev`.
 */
export const telemetry = Layer.unwrap(
  Effect.map(deployStage, (stage) =>
    stage === "dev"
      ? Layer.empty
      : Layer.mergeAll(
          Axiom.Telemetry({
            logs: Logs,
            serviceName: "tranzfer-api",
            token: Ingest,
            traces: Traces,
          }),
          Alchemy.Telemetry.layer(scrubbedTracer),
        ),
  ),
);

const MAX_BODY_BYTES = 256 * 1024;

// The browser's spans, forwarded as they are but for the resource: the
// service name comes from here, not from the caller.
const BrowserSpans = Schema.fromJsonString(
  Schema.Struct({
    resourceSpans: Schema.Array(
      Schema.Struct({
        scopeSpans: Schema.Array(
          Schema.Struct({ spans: Schema.Array(Schema.Record(Schema.String, Schema.Json)) }),
        ),
      }),
    ),
  }),
);

const status = (code: number) => HttpServerResponse.empty({ status: code });

// Resolved at runtime, per invocation: the token is a binding, never a literal.
const lazy = <A>(value: Effect.Effect<A, never, RuntimeContext>) =>
  value.pipe(Effect.provide(RuntimeContext.phantom));

/**
 * Where the browser relay forwards. Dev stages have no Axiom resources and
 * yielding them would create them, so `target` is absent there.
 */
export const relayConfig = Effect.gen(function* relayConfig() {
  const { origin } = yield* Config.schema(Schema.URLFromString, "APP_URL");
  const client = yield* HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer));
  if ((yield* deployStage) === "dev") {
    return { client, origin, target: undefined };
  }
  const traces = yield* Traces;
  const token = yield* Ingest;
  return {
    client,
    origin,
    target: {
      dataset: lazy(yield* traces.name),
      token: lazy(yield* token.token),
      url: lazy(yield* traces.otelTracesEndpoint),
    },
  };
});

/**
 * POST /api/telemetry/traces. The browser has no Axiom credentials; this
 * route holds the ingest token and forwards OTLP JSON to the traces dataset.
 * The token never appears in a response or a log line.
 */
export const relayTraces = ({ client, origin, target }: Effect.Success<typeof relayConfig>) =>
  Effect.gen(function* relay() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (target === undefined) {
      return status(204);
    }
    if (request.headers.origin !== origin) {
      return status(403);
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return status(415);
    }
    // Browsers send a length for string bodies; refusing a missing one keeps
    // an unbounded stream from ever being read.
    const length = Number(request.headers["content-length"]);
    if (!Number.isInteger(length) || length > MAX_BODY_BYTES) {
      return status(413);
    }
    const body = yield* request.text.pipe(Effect.flatMap(Schema.decodeUnknownEffect(BrowserSpans)));
    yield* client.pipe(HttpClient.filterStatusOk).execute(
      HttpClientRequest.post(yield* target.url).pipe(
        HttpClientRequest.setHeaders({
          authorization: `Bearer ${Redacted.value(yield* target.token)}`,
          "x-axiom-dataset": yield* target.dataset,
        }),
        HttpClientRequest.bodyJsonUnsafe({
          resourceSpans: [
            {
              resource: {
                attributes: [{ key: "service.name", value: { stringValue: "tranzfer-web" } }],
              },
              scopeSpans: [
                {
                  scope: { name: "tranzfer-web" },
                  spans: body.resourceSpans.flatMap(({ scopeSpans }) =>
                    scopeSpans.flatMap((scope) => scope.spans),
                  ),
                },
              ],
            },
          ],
        }),
      ),
    );
    return status(204);
  }).pipe(
    Effect.timeout("5 seconds"),
    // Only the failure's tag is logged: an HttpClientError carries the
    // request, and the request carries the token.
    Effect.catch((error) =>
      Effect.logWarning("telemetry relay failed", { error: error._tag }).pipe(
        Effect.as(status(error._tag === "SchemaError" ? 400 : 502)),
      ),
    ),
    // No client span or traceparent for the hop to Axiom.
    Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
  );

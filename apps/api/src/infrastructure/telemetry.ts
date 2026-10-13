import * as Alchemy from "alchemy";
import * as Axiom from "alchemy/Axiom";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Tracer from "effect/Tracer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { Ingest, Traces } from "../resources";
import { lazy } from "./r2";
import { deployStage, stageName } from "./stage";

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

// The fields of a typed error that explain a refusal and carry no person's
// data: a limit's name and wait, a plan, a reason tag, a mail provider's code.
// Other fields (sender names, titles, file paths) stay off the span.
const ErrorFacts = Schema.Struct({
  _tag: Schema.String,
  code: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.String),
  plan: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.Union([Schema.String, Schema.Struct({ _tag: Schema.String })])),
  retryAfterSeconds: Schema.optional(Schema.Number),
});

// Effect's exporter keeps only the error's tag; its message is empty. These
// attributes are the reason, so a refusal can be told from its tag alone.
const errorFacts = (exit: Exit.Exit<unknown, unknown>) =>
  Option.flatMap(Exit.findErrorOption(exit), Schema.decodeUnknownOption(ErrorFacts)).pipe(
    Option.map((facts) => ({
      "error.code": facts.code,
      "error.limit": facts.limit,
      "error.plan": facts.plan,
      "error.reason": Predicate.isString(facts.reason) ? facts.reason : facts.reason?._tag,
      "error.retry_after_s": facts.retryAfterSeconds,
      "error.tag": facts._tag,
    })),
    Option.getOrElse(() => ({})),
  );

// A log line becomes a span event, and its message or cause can quote a
// request. Origins go, so a signed URL never reaches Axiom (the browser does
// the same in `withoutUrls`).
const withoutUrls = (text: string) => text.replaceAll(/https?:\/\/\S+/gu, "<url>");

// Read while the Worker initializes, which is what binds it to the Worker.
// infra/alchemy.run.ts sets it to the commit being deployed.
const gitSha = Config.String("GIT_SHA");

// Wraps the tracer Alchemy builds from the bound Axiom destinations. The
// exporter ignores which tracer layer produced a span, so scrubbing at
// `attribute` covers the server spans, the HTTP client spans and our own.
const scrubbedTracerFor = (version: string) =>
  Layer.effect(
    Tracer.Tracer,
    Effect.gen(function* scrubbedTracer() {
      // Alchemy types its exporter layer with any errors and requirements. It
      // reads config and the HTTP client and degrades to an empty layer when
      // either fails, so the real shape is narrower.
      const bound: Layer.Layer<never, Config.ConfigError, HttpClient.HttpClient> =
        yield* Alchemy.Telemetry.Telemetry;
      // Alchemy's resource has the service name and the stage. OtlpResource
      // reads the version and any other attribute from these two settings, so
      // they go in as config rather than as a span attribute on every span.
      const resource = ConfigProvider.fromUnknown({
        OTEL_RESOURCE_ATTRIBUTES: `deployment.environment.name=${yield* deployStage}`,
        OTEL_SERVICE_VERSION: version,
      });
      // Alchemy's bridge builds `bound` next to this layer in one memo map,
      // so a plain build reuses its copy and never reads the config below.
      const exporters = yield* Layer.build(Layer.fresh(bound)).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.orElse(resource, yield* ConfigProvider.ConfigProvider),
        ),
      );
      const inner = Context.get(exporters, Tracer.Tracer);
      return Tracer.make({
        context: inner.context,
        span(options) {
          const span = inner.span(options);
          const attribute = span.attribute.bind(span);
          const end = span.end.bind(span);
          const event = span.event.bind(span);
          // The span belongs to the exporter's tracer, so patching its methods
          // is the only seam between creating it and writing to it.
          span.attribute = (key, value) => {
            // The client's address is not worth keeping.
            if (key !== "client.address") {
              attribute(key, isScrubbed(key) ? "<redacted>" : value);
            }
          };
          span.end = (endTime, exit) => {
            for (const [key, value] of Object.entries(errorFacts(exit))) {
              if (value !== undefined) {
                attribute(key, value);
              }
            }
            end(endTime, exit);
          };
          span.event = (name, startTime, attributes) => {
            event(
              withoutUrls(name),
              startTime,
              attributes &&
                Object.fromEntries(
                  Object.entries(attributes).map(([key, value]) => [
                    key,
                    Predicate.isString(value) ? withoutUrls(value) : value,
                  ]),
                ),
            );
          };
          return span;
        },
      });
    }),
  );

/**
 * Traces, with log lines as span events, to this stage's Axiom dataset. Dev stages ship nothing:
 * the Axiom resources would need org credentials just to run `vp run dev`.
 *
 * The Worker runtime installs the console logger alone, which drops Effect's
 * default `tracerLogger`, so no log line ever reached a span. This sets both.
 */
export const telemetry = Layer.unwrap(
  Effect.gen(function* telemetry() {
    if ((yield* deployStage) === "dev") {
      return Layer.empty;
    }
    return Layer.mergeAll(
      Axiom.Telemetry({
        serviceName: "tranzfer-api",
        token: Ingest,
        traces: Traces,
      }),
      Alchemy.Telemetry.layer(
        Layer.merge(
          scrubbedTracerFor(yield* gitSha),
          Logger.layer([Logger.consolePretty(), Logger.tracerLogger]),
        ),
      ),
    );
  }),
);

const MAX_BODY_BYTES = 256 * 1024;

// The browser's spans, forwarded as they are but for the resource: the
// service name, stage and environment come from here, not from the caller.
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

/**
 * Where the browser relay forwards. Dev stages have no Axiom resources and
 * yielding them would create them, so `target` is absent there.
 */
export const relayConfig = Effect.gen(function* relayConfig() {
  const { origin } = yield* Config.schema(Schema.URLFromString, "APP_URL");
  const client = yield* HttpClient.HttpClient;
  const environment = yield* deployStage;
  if (environment === "dev") {
    return { client, origin, target: undefined };
  }
  const traces = yield* Traces;
  const token = yield* Ingest;
  return {
    client,
    origin,
    target: {
      dataset: lazy(yield* traces.name),
      environment,
      stage: yield* stageName,
      token: lazy(yield* token.token),
      url: lazy(yield* traces.otelTracesEndpoint),
      version: yield* gitSha,
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
    // The tab's own build, which can be older than this Worker. Anything that
    // is not a full commit hash is ignored.
    const build = request.headers["x-tranzfer-build"];
    const version = build !== undefined && /^[0-9a-f]{40}$/u.test(build) ? build : target.version;
    // Stops reading one chunk past the cap, so an oversized body is never
    // buffered whole and no header has to be trusted.
    const chunks = yield* request.stream.pipe(
      Stream.mapAccum(
        () => 0,
        (total, chunk) => [total + chunk.byteLength, [{ chunk, total: total + chunk.byteLength }]],
      ),
      Stream.takeUntil(({ total }) => total > MAX_BODY_BYTES),
      Stream.runCollect,
    );
    if ((chunks.at(-1)?.total ?? 0) > MAX_BODY_BYTES) {
      return status(413);
    }
    const decoder = new TextDecoder();
    const body = yield* Schema.decodeUnknownEffect(BrowserSpans)(
      chunks.map(({ chunk }) => decoder.decode(chunk, { stream: true })).join("") +
        decoder.decode(),
    );
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
                attributes: [
                  { key: "service.name", value: { stringValue: "tranzfer-web" } },
                  { key: "service.version", value: { stringValue: version } },
                  {
                    key: "deployment.environment.name",
                    value: { stringValue: target.environment },
                  },
                  { key: "alchemy.stage", value: { stringValue: target.stage } },
                ],
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
    Effect.tapError((error) => Effect.logWarning("telemetry relay failed", { error: error._tag })),
    Effect.catchTag("SchemaError", () => Effect.succeed(status(400))),
    Effect.catch(() => Effect.succeed(status(502))),
    // No client span or traceparent for the hop to Axiom.
    Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
  );

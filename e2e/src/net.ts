import type { CDPSession, Page } from "playwright";

import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import { Browser } from "./browser";
import { classify } from "./ledger";
import { Target } from "./target";

interface Paused {
  readonly requestId: string;
  readonly request: {
    readonly headers: Readonly<Record<string, string>>;
    readonly method: string;
    readonly postData?: string;
    readonly url: string;
  };
  readonly responseHeaders?: readonly { readonly name: string; readonly value: string }[];
  readonly responseStatusCode?: number;
}

const R2 = "https://*.r2.cloudflarestorage.com/";

/**
 * Pauses responses whose URL matches `urlPattern` on the page, through its own
 * CDP session. Never pause part uploads to fake their failure: Playwright's
 * route() pauses every request with its body (parts went from ~3.5 s to ~12 s
 * and the ledger's browser events arrived late or not at all); a request-stage
 * Fetch pattern held each 64 MiB part ~17 s and stranded the fetcher's retry;
 * replacing a part's response hung every part in flight. Responses still
 * flow normally here; only the matching ones wait on `claim`, which decides
 * synchronously so of two paused together only one fires. It returns the
 * trap's action, or null to let the response through. The session stays on
 * after firing and passes everything through.
 */
const intercept = async (
  page: Page,
  urlPattern: string,
  claim: (paused: Paused, session: CDPSession) => (() => Promise<void>) | null,
) => {
  const session = await page.context().newCDPSession(page);
  let done = false;
  session.on("Fetch.requestPaused", (paused) => {
    const fire = done ? null : claim(paused, session);
    done ||= fire !== null;
    void (async () => {
      if (fire === null) {
        await session.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }
      await fire();
    })().catch(() => {
      // Usually the page navigated or closed under the paused request; a
      // swallowed failure here once left parts hanging, so say it.
      process.stderr.write(`NetControl: a paused request was not released\n`);
    });
  });
  await session.send("Fetch.enable", {
    patterns: [{ requestStage: "Response", urlPattern }],
  });
};

/**
 * Network faults applied through the current browser context. Traps armed
 * but unfired when the browser relaunches get reinstalled through a
 * Browser.onContext hook, so a crash mid-trap doesn't silently disarm it.
 */
export class NetControl extends Context.Service<
  NetControl,
  {
    /** Cut all networking for the duration, then restore it. */
    readonly offline: (duration: Duration.Input) => Effect.Effect<void, Error>;
    /**
     * Arms the part-failure trap: the next part signature the API hands the
     * page comes back with one character of X-Amz-Signature changed, so R2
     * itself rejects that part (403) and the browser sees a real failure.
     * Part bytes are never intercepted. The returned Deferred resolves with
     * the part number once it fires.
     */
    readonly failPartOnce: Effect.Effect<
      Deferred.Deferred<{ partNumber: number; at: number }>,
      Error
    >;
    /**
     * Arms the lost-response trap: the first R2 Complete POST is really sent
     * to R2, then the response is aborted with a reset. The returned Deferred
     * resolves to R2's true status once it fires.
     */
    readonly loseCompleteResponse: Effect.Effect<Deferred.Deferred<number>, Error>;
  }
>()("tranzfer/e2e/NetControl") {
  static readonly layer = Layer.effect(
    NetControl,
    Effect.gen(function* make() {
      const browser = yield* Browser;
      const target = yield* Target;
      // CDP event handlers are callbacks; Ref and Deferred ops are
      // synchronous Effects, so one context serves them at the edge.
      const env = yield* Effect.context();
      const run = Effect.runSyncWith(env);

      interface Armed {
        readonly failPart: Deferred.Deferred<{ partNumber: number; at: number }> | undefined;
        readonly complete: Deferred.Deferred<number> | undefined;
      }
      const armed = yield* Ref.make<Armed>({ complete: undefined, failPart: undefined });

      const install = Effect.fn("NetControl.install")(function* install(page: Page) {
        const { complete, failPart } = yield* Ref.get(armed);
        if (failPart !== undefined) {
          const reply = failPart;
          yield* Effect.promise(async () => {
            await intercept(page, `${target.baseUrl}/rpc*`, (paused, session) => {
              const body = paused.request.postData ?? "";
              const part = /"SignUpload".*"partNumber":(?<n>\d+)/su.exec(body)?.groups?.n;
              if (part === undefined || paused.responseStatusCode !== 200) {
                return null;
              }
              run(Ref.update(armed, (a) => ({ ...a, failPart: undefined })));
              run(Deferred.succeed(reply, { at: Date.now(), partNumber: Number(part) }));
              return async () => {
                const original = await session.send("Fetch.getResponseBody", {
                  requestId: paused.requestId,
                });
                const text = original.base64Encoded
                  ? Buffer.from(original.body, "base64").toString("utf-8")
                  : original.body;
                const forged = text.replace(
                  /X-Amz-Signature=(?<first>[0-9a-f])/u,
                  (_match, first: string) => `X-Amz-Signature=${first === "0" ? "1" : "0"}`,
                );
                await session.send("Fetch.fulfillRequest", {
                  body: Buffer.from(forged, "utf-8").toString("base64"),
                  requestId: paused.requestId,
                  responseCode: 200,
                  // CDP hands back the decoded body, so drop the encoding and
                  // length that described the original bytes.
                  responseHeaders: (paused.responseHeaders ?? []).filter(
                    ({ name }) => !/^content-(?:encoding|length)$/iu.test(name),
                  ),
                });
              };
            });
          });
        }
        if (complete !== undefined) {
          const reply = complete;
          yield* Effect.promise(async () => {
            // Parts sign as ?partNumber=…&uploadId=…, so a query that starts with
            // uploadId is a Complete or a first-page List and never a part body.
            // CDP patterns treat ? as a wildcard; the backslash makes it literal.
            await intercept(page, `${R2}*\\?uploadId=*`, (paused, session) => {
              if (classify(paused.request.method, paused.request.url)?.kind !== "complete") {
                return null;
              }
              run(Ref.update(armed, (a) => ({ ...a, complete: undefined })));
              // R2 really completed the upload; only the response is lost.
              run(Deferred.succeed(reply, paused.responseStatusCode ?? 0));
              return async () => {
                await session.send("Fetch.failRequest", {
                  errorReason: "ConnectionReset",
                  requestId: paused.requestId,
                });
              };
            });
          });
        }
      });

      // A relaunch gives a fresh context whose page opens after the hooks run;
      // whatever was still armed goes back on that page.
      const fork = Effect.runForkWith(env);
      yield* browser.onContext((context) =>
        Effect.sync(() => {
          context.once("page", (page) => {
            fork(install(page));
          });
        }),
      );

      const offline = Effect.fn("NetControl.offline")(function* offline(duration: Duration.Input) {
        const browserContext = yield* browser.context;
        yield* Effect.promise(async () => {
          await browserContext.setOffline(true);
        });
        yield* Effect.sleep(duration);
        yield* Effect.promise(async () => {
          await browserContext.setOffline(false);
        });
      });

      const failPartOnce = Effect.fn("NetControl.failPartOnce")(function* failPart() {
        const fired = yield* Deferred.make<{ partNumber: number; at: number }>();
        yield* Ref.update(armed, (a) => ({ ...a, failPart: fired }));
        yield* install(yield* browser.page);
        return fired;
      });

      const loseCompleteResponse = Effect.fn("NetControl.loseCompleteResponse")(
        function* loseComplete() {
          const fired = yield* Deferred.make<number>();
          yield* Ref.update(armed, (a) => ({ ...a, complete: fired }));
          yield* install(yield* browser.page);
          return fired;
        },
      );

      return NetControl.of({
        failPartOnce: failPartOnce(),
        loseCompleteResponse: loseCompleteResponse(),
        offline: (duration) => offline(duration),
      });
    }),
  );
}

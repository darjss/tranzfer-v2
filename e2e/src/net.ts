import type { CDPSession, Page } from "playwright";

import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import { Browser } from "./browser";
import { classify } from "./ledger";

interface Paused {
  readonly requestId: string;
  readonly request: {
    readonly headers: Readonly<Record<string, string>>;
    readonly method: string;
    readonly url: string;
  };
  readonly responseStatusCode?: number;
}

/**
 * Pauses R2 requests matching `pattern` on the page through its own
 * CDP session. Playwright's route() would intercept every request, 64 MiB part
 * bodies included: parts slowed from ~3.5 s to ~12 s and the browser's network
 * events, which feed the ledger, arrived late or not at all. A narrow Fetch
 * pattern pauses only what a trap needs. `claim` decides synchronously, so of
 * two parts paused together only one fires: it returns the trap's action, or
 * null to let the request through. Interception stops once one fires.
 */
const intercept = async (
  page: Page,
  pattern: { readonly urlPattern: string; readonly requestStage: "Request" | "Response" },
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
      await session.send("Fetch.disable");
      await session.detach();
    })().catch(() => {
      // The page navigated or closed under the paused request.
    });
  });
  await session.send("Fetch.enable", {
    patterns: [
      { ...pattern, urlPattern: `https://*.r2.cloudflarestorage.com/${pattern.urlPattern}` },
    ],
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
     * Arms the part-failure trap: the next R2 part PUT gets a synthetic 503
     * and everything else passes through. The returned Deferred resolves with
     * the failed part number once it fires.
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
            await intercept(
              page,
              { requestStage: "Request", urlPattern: "*partNumber=*" },
              (paused, session) => {
                const part = classify(paused.request.method, paused.request.url);
                if (part?.kind !== "part" || part.partNumber === null) {
                  return null;
                }
                run(Ref.update(armed, (a) => ({ ...a, failPart: undefined })));
                run(Deferred.succeed(reply, { at: Date.now(), partNumber: part.partNumber }));
                // R2 would send CORS headers on its own 503; without them the
                // page reads a network error instead of the status.
                const origin =
                  paused.request.headers.Origin ?? paused.request.headers.origin ?? "*";
                return async () => {
                  await session.send("Fetch.fulfillRequest", {
                    requestId: paused.requestId,
                    responseCode: 503,
                    responseHeaders: [{ name: "Access-Control-Allow-Origin", value: origin }],
                  });
                };
              },
            );
          });
        }
        if (complete !== undefined) {
          const reply = complete;
          yield* Effect.promise(async () => {
            await intercept(
              page,
              // Response stage: requests, part bodies included, go out as
              // usual; only their response headers wait here.
              { requestStage: "Response", urlPattern: "*uploadId=*" },
              (paused, session) => {
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
              },
            );
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

import type { BrowserContext, Route } from "playwright";

import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import { Browser } from "./browser";
import { classify } from "./ledger";

const isR2 = (url: URL) => url.hostname.endsWith(".r2.cloudflarestorage.com");

const kindOf = (route: Route) => classify(route.request().method(), route.request().url())?.kind;

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
    /** The next R2 part PUT gets a synthetic 503; everything else passes through. */
    readonly failPartOnce: Effect.Effect<void, Error>;
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
      // Route handlers are playwright callbacks; Ref and Deferred ops are
      // synchronous Effects, so one context serves them at the edge.
      const env = yield* Effect.context();
      const run = Effect.runSyncWith(env);

      interface Armed {
        readonly failPart: boolean;
        readonly complete: Deferred.Deferred<number> | undefined;
      }
      const armed = yield* Ref.make<Armed>({ complete: undefined, failPart: false });

      const install = Effect.fn("NetControl.install")(function* install(context: BrowserContext) {
        const { complete, failPart } = yield* Ref.get(armed);
        if (failPart) {
          const handler = async (route: Route) => {
            if (kindOf(route) !== "part") {
              await route.fallback();
              return;
            }
            run(Ref.update(armed, (a) => ({ ...a, failPart: false })));
            await context.unroute(isR2, handler);
            await route.fulfill({ status: 503 });
          };
          yield* Effect.promise(async () => await context.route(isR2, handler));
        }
        if (complete !== undefined) {
          const reply = complete;
          const handler = async (route: Route) => {
            if (kindOf(route) !== "complete") {
              await route.fallback();
              return;
            }
            run(Ref.update(armed, (a) => ({ ...a, complete: undefined })));
            await context.unroute(isR2, handler);
            // R2 really completes the upload; only the response is lost.
            const response = await route.fetch();
            run(Deferred.succeed(reply, response.status()));
            await route.abort("connectionreset");
          };
          yield* Effect.promise(async () => await context.route(isR2, handler));
        }
      });

      // A relaunch gives a fresh context; whatever was still armed goes back on.
      yield* browser.onContext((context) => install(context));

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
        yield* Ref.update(armed, (a) => ({ ...a, failPart: true }));
        yield* install(yield* browser.context);
      });

      const loseCompleteResponse = Effect.fn("NetControl.loseCompleteResponse")(
        function* loseComplete() {
          const fired = yield* Deferred.make<number>();
          yield* Ref.update(armed, (a) => ({ ...a, complete: fired }));
          yield* install(yield* browser.context);
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

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import type { BrowserContext, Page, Browser as PlaywrightBrowser, Request } from "playwright";
import { chromium } from "playwright";

import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Scope from "effect/Scope";
import * as Data from "effect/Data";

import { classify, Ledger } from "./ledger";
import { Target } from "./target";

interface Session {
  readonly browser: PlaywrightBrowser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly process: ChildProcess;
}

class DevToolsPortError extends Data.TaggedError("DevToolsPortError")<{
  readonly message: string;
}> {}

const killGroup = (child: ChildProcess, signal: "SIGKILL" | "SIGTERM" | "SIGSTOP" | "SIGCONT") =>
  Effect.sync(() => {
    const { pid } = child;
    if (pid !== undefined) {
      try {
        // The group (-pid) covers the renderer and utility children.
        process.kill(-pid, signal);
      } catch {
        // Group already gone.
      }
    }
  });

/**
 * Chromium is spawned directly (detached, own process group) rather than
 * through playwright.launch so crash() can SIGKILL the whole group the way a
 * power loss would, and so the profile at <run>/profile keeps IndexedDB
 * records alive across a crash and relaunch. connectOverCDP attaches to the
 * port Chromium picks (--remote-debugging-port=0, read back from
 * DevToolsActivePort); contexts()[0] is that persistent profile.
 */
export class Browser extends Context.Service<
  Browser,
  {
    readonly launch: Effect.Effect<void, Error>;
    readonly crash: Effect.Effect<void>;
    readonly freeze: (duration: Duration.Input) => Effect.Effect<void, Error>;
    readonly close: Effect.Effect<void>;
    readonly context: Effect.Effect<BrowserContext, Error>;
    readonly page: Effect.Effect<Page, Error>;
    /** A new tab at baseUrl + route; becomes the session's current page. */
    readonly open: (route: string) => Effect.Effect<Page, Error>;
    /** Chromium version string of the running browser. */
    readonly version: Effect.Effect<string, Error>;
    /** NetControl registers traps here so they re-apply after a relaunch. */
    readonly onContext: (
      apply: (context: BrowserContext) => Effect.Effect<void>,
    ) => Effect.Effect<void>;
  }
>()("tranzfer/e2e/Browser") {
  static readonly layer = (dir: string) =>
    Layer.effect(
      Browser,
      Effect.gen(function* make() {
        const target = yield* Target;
        const ledger = yield* Ledger;
        const env = yield* Effect.context<Ledger>();
        const scope = yield* Scope.Scope;
        // record and settle are synchronous Effects: runSync at the edge keeps
        // pending.set inside the request handler, so a requestfinished that
        // fires before the microtask still finds its index.
        const runSync = Effect.runSyncWith(env);

        const state = yield* Ref.make<Option.Option<Session>>(Option.none());
        const hooks = yield* Ref.make<
          readonly ((context: BrowserContext) => Effect.Effect<void>)[]
        >([]);
        let sessionNo = 0;

        const spawnChromium = Effect.sync(() => {
          const child = spawn(
            chromium.executablePath(),
            [
              "--headless=new",
              // Gates run in containers without user namespaces.
              "--no-sandbox",
              `--user-data-dir=${path.join(dir, "profile")}`,
              "--remote-debugging-port=0",
              "--no-first-run",
              "--no-default-browser-check",
            ],
            { detached: true, stdio: "ignore" },
          );
          child.unref();
          return child;
        });

        const debugPort = Effect.tryPromise({
          catch: () => new DevToolsPortError({ message: "DevToolsActivePort unreadable" }),
          try: async () => {
            const contents = await readFile(
              path.join(dir, "profile", "DevToolsActivePort"),
              "utf-8",
            );
            const port = Number(contents.split("\n")[0]);
            if (!Number.isInteger(port) || port <= 0) {
              throw new Error(`unexpected DevToolsActivePort: ${contents}`);
            }
            return port;
          },
        }).pipe(
          Effect.retry({
            schedule: Schedule.spaced("200 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
          }),
          Effect.catch(() => Effect.die(new Error("chromium never wrote DevToolsActivePort"))),
        );

        const kill = Effect.fn("Browser.kill")(function* kill() {
          const current = yield* Ref.get(state);
          if (Option.isSome(current)) {
            yield* killGroup(current.value.process, "SIGKILL");
            if (current.value.process.exitCode === null) {
              yield* Effect.promise(async () => {
                await once(current.value.process, "exit");
              });
            }
          }
        });

        const watch = (context: BrowserContext) => {
          const pending = new Map<Request, number>();
          context.on("request", (request) => {
            const classified = classify(request.method(), request.url());
            if (classified === null) {
              return;
            }
            const index = runSync(
              ledger.record({
                at: Date.now(),
                session: sessionNo,
                ...classified,
                status: null,
              }),
            );
            pending.set(request, index);
          });
          context.on("requestfinished", (request) => {
            const index = pending.get(request);
            if (index === undefined) {
              return;
            }
            pending.delete(request);
            void request
              .response()
              .then((response) => {
                runSync(ledger.settle(index, response?.status() ?? 0));
              })
              .catch(() => {
                runSync(ledger.settle(index, null));
              });
          });
          context.on("requestfailed", (request) => {
            const index = pending.get(request);
            if (index === undefined) {
              return;
            }
            pending.delete(request);
            // No response ever arrived; the entry settles as status null.
            runSync(ledger.settle(index, null));
          });
        };

        const login = Effect.fn("Browser.login")(function* login(page: Page) {
          yield* Effect.promise(async () => await page.goto(target.baseUrl));
          const ok = yield* Effect.promise(
            async () =>
              await page.evaluate(async (key) => {
                const response = await fetch("/api/auth/staging-login", {
                  body: JSON.stringify({ key }),
                  credentials: "include",
                  headers: { "content-type": "application/json" },
                  method: "POST",
                });
                return response.ok;
              }, target.loginKey),
          );
          if (!ok) {
            return yield* Effect.die(new Error("staging-login failed inside the browser"));
          }
          return yield* Effect.void;
        });

        const launch = Effect.fn("Browser.launch")(function* launch() {
          yield* kill();
          sessionNo += 1;
          // A crashed session leaves DevToolsActivePort with a dead port; the
          // file must go before spawn or the next launch connects to a corpse.
          yield* Effect.promise(async () => {
            await rm(path.join(dir, "profile", "DevToolsActivePort"), { force: true });
          });
          const child = yield* spawnChromium;
          // Until the child lands in `state`, a failed connect or login would
          // leak the whole process group; killGroup ignores a dead pid.
          yield* Effect.addFinalizer(() => killGroup(child, "SIGKILL")).pipe(
            Effect.provideService(Scope.Scope, scope),
          );
          const port = yield* debugPort;
          const browser = yield* Effect.promise(
            async () => await chromium.connectOverCDP(`http://127.0.0.1:${port}`),
          );
          const [browserContext] = browser.contexts();
          if (browserContext === undefined) {
            return yield* Effect.die(new Error("chromium exposed no browser context"));
          }
          watch(browserContext);
          yield* Effect.forEach(yield* Ref.get(hooks), (apply) => apply(browserContext));
          const page = yield* Effect.promise(async () => await browserContext.newPage());
          yield* login(page);
          yield* Ref.set(
            state,
            Option.some({ browser, context: browserContext, page, process: child }),
          );
          yield* Effect.promise(async () => await page.goto(`${target.baseUrl}/deliveries`));
          return yield* Effect.void;
        });

        const crash = Effect.fn("Browser.crash")(function* crash() {
          yield* kill();
          yield* Ref.set(state, Option.none());
        });

        const freeze = Effect.fn("Browser.freeze")(function* freeze(duration: Duration.Input) {
          const current = yield* Ref.get(state);
          if (Option.isNone(current)) {
            return yield* Effect.die(new Error("freeze needs a running browser"));
          }
          yield* killGroup(current.value.process, "SIGSTOP");
          yield* Effect.sleep(duration);
          return yield* killGroup(current.value.process, "SIGCONT");
        });

        const close = Effect.fn("Browser.close")(function* close() {
          const current = yield* Ref.get(state);
          if (Option.isNone(current)) {
            return;
          }
          yield* Effect.promise(async () => {
            await current.value.browser.close();
          }).pipe(Effect.timeout("10 seconds"), Effect.ignore);
          yield* kill();
          yield* Ref.set(state, Option.none());
        });

        yield* Effect.addFinalizer(() => close().pipe(Effect.ignore));

        const open = Effect.fn("Browser.open")(function* open(route: string) {
          const current = yield* Ref.get(state);
          if (Option.isNone(current)) {
            return yield* Effect.die(new Error("open needs a running browser"));
          }
          const page = yield* Effect.promise(async () => await current.value.context.newPage());
          yield* Effect.promise(async () => await page.goto(`${target.baseUrl}${route}`));
          yield* Ref.set(state, Option.some({ ...current.value, page }));
          return page;
        });

        const need = <A>(pick: (session: Session) => A) =>
          Effect.flatMap(Ref.get(state), (session) =>
            Option.isSome(session)
              ? Effect.succeed(pick(session.value))
              : Effect.die(new Error("browser is not running")),
          );

        return Browser.of({
          close: close(),
          context: need((session) => session.context),
          crash: crash(),
          freeze: (duration) => freeze(duration),
          launch: launch().pipe(Effect.asVoid),
          onContext: (apply) => Ref.update(hooks, (all) => [...all, apply]),
          open: (route) => open(route),
          page: need((session) => session.page),
          version: Effect.map(
            need((session) => session.browser),
            (b) => b.version(),
          ),
        });
      }),
    );
}

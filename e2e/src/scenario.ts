import { mkdir, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import path from "node:path";

import { layer } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";

import { Browser } from "./browser";
import { ackedParts, Ledger } from "./ledger";
import { NetControl } from "./net";
import { Target } from "./target";

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface Step {
  readonly at: number;
  readonly name: string;
  readonly partsAcked: number;
}

/** Result fields must be JSON-serializable — they go verbatim into result.json. */
export class Run extends Context.Service<
  Run,
  {
    readonly dir: string;
    readonly step: (name: string) => Effect.Effect<void>;
    readonly manual: (reason: string) => Effect.Effect<void>;
    readonly record: (key: string, value: JsonValue) => Effect.Effect<void>;
    readonly timeline: Effect.Effect<readonly Step[]>;
    readonly manualReasons: Effect.Effect<readonly string[]>;
    readonly recorded: Effect.Effect<Record<string, JsonValue>>;
  }
>()("tranzfer/e2e/Run") {}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

/**
 * Runs `body` as one named gate scenario. Everything the run produces —
 * screenshots, ledger.jsonl, result.json — lands in e2e/runs/<slug>-<ts>/.
 * The layers are built here so the browser profile and the ledger file share
 * that directory. No playwright trace or video: gates run for hours and the
 * archives bloat.
 */
export const scenario = (
  name: string,
  options: { readonly timeout: Duration.Input },
  body: Effect.Effect<void, Error, Browser | Ledger | NetControl | Run | Scope.Scope | Target>,
) => {
  const dir = path.join(
    import.meta.dirname,
    "..",
    "runs",
    `${slugify(name)}-${new Date().toISOString().replaceAll(/[:.]/gu, "-")}`,
  );
  const ledgerLayer = Ledger.layer(dir);
  const browserLayer = Browser.layer(dir).pipe(Layer.provide([Target.layer, ledgerLayer]));
  const testLayer = Layer.mergeAll(
    Target.layer,
    ledgerLayer,
    browserLayer,
    NetControl.layer.pipe(Layer.provide(browserLayer)),
  );
  layer(testLayer)("gate", (it) => {
    it.effect(
      name,
      () =>
        Effect.gen(function* run() {
          yield* Effect.promise(async () => await mkdir(dir, { recursive: true }));

          const browser = yield* Browser;
          const ledger = yield* Ledger;
          const steps = yield* Ref.make<readonly Step[]>([]);
          const interventions = yield* Ref.make<readonly string[]>([]);
          const recorded = yield* Ref.make<Record<string, JsonValue>>({});
          let shot = 0;
          const snap = Effect.fn("Run.screenshot")(function* snap(label: string) {
            const page = yield* Effect.option(browser.page);
            if (Option.isSome(page)) {
              shot += 1;
              yield* Effect.promise(
                async () =>
                  await page.value.screenshot({
                    path: path.join(dir, `${String(shot).padStart(2, "0")}-${label}.png`),
                  }),
              ).pipe(Effect.ignore);
            }
          });

          const service = {
            dir,
            manual: (reason: string) => Ref.update(interventions, (all) => [...all, reason]),
            manualReasons: Ref.get(interventions),
            record: (key: string, field: JsonValue) =>
              Ref.update(recorded, (all) => ({ ...all, [key]: field })),
            recorded: Ref.get(recorded),
            step: Effect.fn("Run.step")(function* step(stepName: string) {
              const requests = yield* ledger.all;
              yield* Ref.update(steps, (all) => [
                ...all,
                { at: Date.now(), name: stepName, partsAcked: ackedParts(requests).size },
              ]);
              yield* snap(slugify(stepName));
            }),
            timeline: Ref.get(steps),
          };

          const exit = yield* Effect.exit(body.pipe(Effect.provideService(Run, Run.of(service))));

          const chromium = yield* Effect.option(
            browser.version.pipe(Effect.catch(() => Effect.succeed("closed"))),
          );
          const target = yield* Target;
          const failed = Exit.isFailure(exit);
          if (failed) {
            yield* snap("failure");
          }
          const result = {
            environment: {
              baseUrl: target.baseUrl,
              chromium: Option.getOrElse(chromium, () => "unavailable"),
              cpu: cpus()[0]?.model ?? "unknown",
              ramGb: Math.round(totalmem() / 1024 ** 3),
              revision: process.env.GIT_COMMIT ?? "unknown",
            },
            error: failed ? Cause.pretty(exit.cause) : null,
            manual: yield* Ref.get(interventions),
            name,
            passed: !failed,
            recorded: yield* Ref.get(recorded),
            timeline: yield* Ref.get(steps),
          };
          yield* Effect.promise(async () => {
            await writeFile(path.join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
          });
          if (failed) {
            return yield* Effect.failCause(exit.cause);
          }
          return yield* Effect.void;
        }),
      Duration.toMillis(options.timeout),
    );
  });
};

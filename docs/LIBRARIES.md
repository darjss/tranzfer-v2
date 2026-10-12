# Libraries

Read this before you search `node_modules` or the web for how a library works. Each section says where the library's docs and types are installed, then lists mistakes agents made more than once. Installed code beats this file, the skills and the reference checkouts. When one of them is wrong, fix it in the PR that finds out.

Checked on 2026-10-12 against effect 4.0.1, solid-js and @solidjs/web 2.0.0-rc.13, alchemy 2.0.0-beta.81, drizzle-orm and drizzle-kit 1.0.0-rc.5-ab785fc, Panda 2.1.1, vite-plus 1.0.0 and better-auth 1.7.7. Manifests hold the current versions.

## Finding installed source

- Resolve a package from the workspace that owns the code. Alchemy and Better Auth are in `apps/api/node_modules`, `infra/node_modules` has its own Alchemy, Solid and Panda are in `apps/web/node_modules`, drizzle is in `packages/db/node_modules`. The root holds Effect, Vite+ and the lint tools. A script run from `/tmp` resolves a different copy.
- Do not build `.pnpm/<hash>` paths or use a file finder that skips gitignored folders. `rg -n 'name' apps/api/node_modules/alchemy/src` works as written. For a transitive package, `ls -d node_modules/.pnpm/@solidjs+signals@*`.
- Never edit a file under `node_modules`. pnpm hard-links it from the shared store, so the edit reaches every worktree (`ViteBuildChildRunner.js` had 24 links). Copy the file to `/tmp` or use `pnpm patch`.
- Alchemy ships `src` and `lib` but no docs. Read https://alchemy.run/llms.txt (an index of pages) or the `alchemy-run/alchemy` repo under `website/src/content/docs` at the installed tag.

## Effect

Read `node_modules/effect/AGENTS.md`, then the examples in `node_modules/effect/ai-docs/src/<topic>/` before you grep `src`. Topics: `01_effect` (basics, schema, services, errors, resources, running), `03_stream`, `04_integration` (ManagedRuntime), `05_batching`, `06_schedule`, `08_observability` (logging, OTLP tracing), `09_testing`, `40_sql`, `50_http-client`, `51_http-server`, `70_cli`.

Types are the flat `node_modules/effect/dist/*.d.ts` (there is no `dist/dts`); sources are in `node_modules/effect/src`. Subpath modules are `effect/rpc`, `effect/http`, `effect/sql`, `effect/cli`, `effect/observability`, `effect/encoding/Base64Url` and `effect/encoding/Hex`.

Other packages: `@effect/platform-node` in `apps/api`, `@effect/sql-d1` in `packages/db` and `@effect/vitest` for tests, all 4.0.1. `@effect/tsgo` 0.48.1 is the typecheck and language service, set under `plugins` in each `tsconfig.json`; its rules are listed in `node_modules/@effect/tsgo/README.md`.

Names that moved since 4.0.0-rc. The old form fails or does not exist.

| Old or guessed                                 | Use                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `effect/unstable/rpc`, `/http`, `/sql`, `/cli` | `effect/rpc`, `effect/http`, `effect/sql`, `effect/cli`                                                               |
| `effect/Encoding`, `decodeBase64Url`           | `effect/encoding/Base64Url` `decode`, which returns a `Result`                                                        |
| `Config.string`, `.boolean`, `.redacted`       | `Config.String`, `Config.Boolean`, `Config.Redacted`, plus `NonEmptyString`, `URL`, `Port`                            |
| `Config.mapOrFail`, `Config.nonEmpty`          | Neither exists. Refine with `Config.schema(codec, name)`                                                              |
| `Schema.decodeUnknown`                         | `Schema.decodeUnknownEffect`                                                                                          |
| `Schema.isLengthBetween`                       | `Schema.isBetweenLength`                                                                                              |
| `Schema.TaggedErrorClass`                      | `Schema.TaggedError<Self>()("Tag", fields)`                                                                           |
| `Effect.either`, `effect/Either`               | `Effect.result` and `effect/Result`                                                                                   |
| `Effect.ignoreLogged`                          | `Effect.ignore({ log: true })` for typed failures, `Effect.ignoreCause({ log: true })` to swallow defects as well     |
| `Exit.isInterrupted`                           | `Cause.hasInterruptsOnly(exit.cause)`. `Exit.hasInterrupts` is a `self is Failure` guard that narrows else to `never` |
| `YieldWrap`                                    | Gone. Effects are iterable directly                                                                                   |

- `Schema.decodeUnknownEffect(schema)(input)` fails with `Schema.SchemaError`. `schema.makeEffect(input)` (typed constructor input) fails with `SchemaIssue.Issue`. Map one to the other with `new Schema.SchemaError(issue)`.
- Forking is `Effect.forkChild`, `forkDetach` and `forkScoped`; use `forkScoped` for work a layer owns. `Effect.catchAll` and `Effect.fork` are gone; `Effect.catch` replaces `catchAll`.
- `TestClock` is `effect/testing/TestClock`, not the root barrel.
- Class-style definitions take `typeof X` in type helpers. `RpcClient.FromGroup<typeof Api, RpcClientError>` has the RPC names; `FromGroup<Api>` has `keyof` of `never`. One agent reported this as a library bug.
- `Effect.promise` turns a rejection into a defect, and `Effect.ignore` does not catch defects. Use `Effect.tryPromise` with a handler when the promise can reject.
- `ConfigProvider.fromEnv` treats an empty string as missing, so `Config.option(Config.String("X"))` is `None` for `X=`. Pass `preserveEmptyStrings: true` to keep it.
- In `Effect.gen`, write `return yield* new MyError(...)` and make every branch return a value. That satisfies both the `missingReturnYieldStar` check and the `consistent-return` lint.
- `strictEffectProvide` flags `Effect.provide` outside an entry point. The 19 warnings in `vp check` are entry points and tests. Do not add more.
- Row defaults such as `createdAt` come from SQL `unixepoch`, which `TestClock` does not move. Pass times from `Clock.currentTimeMillis` when a test compares against them.
- Run scratch scripts inside a workspace so they resolve the pinned `effect`. From `/tmp`, bun picked up another copy and failed with missing exports.

## Solid 2

Read `apps/web/node_modules/solid-js/CHEATSHEET.md` first. It matches the installed rc.13; the skill's `references/` target rc.8. Types are in `apps/web/node_modules/solid-js/types` and `apps/web/node_modules/@solidjs/web/types`. Repair guides for diagnostic codes are in `apps/web/node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` and `apps/web/node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`. `@solidjs/router` is 2.0.0-next.35 and `@solidjs/meta` is 1.0.0-next.2; neither ships docs beyond a README.

- `createEffect(compute, apply)` takes two functions. The cheatsheet's "What changed from 1.x" lists the rest: `onMount` is `onSettled`, `on()` and `createComputed` are gone, `ErrorBoundary` is `Errored`.
- `<For each>` rows are plain values and the index is an accessor. With `keyed={false}` or `keyed={fn}` the row is an accessor. `<Show>` and `<Match>` function children get an accessor unless `keyed`. Read an accessor in JSX, a memo or an effect, never at the top of the callback.
- A list rebuilt from fresh objects on every change trips `HOT_SCOPE_TIME`. Project it by id with `createProjection(fn, [], { name })` (see `apps/web/src/marketing/PriceCalculator.tsx`). Adding `keyed` did not help.
- `<Dynamic>` is deprecated. Use `dynamic(() => Component)`. `clientOnly(() => import(...))` renders only the fallback on the server (see `apps/web/src/App.tsx`).
- `@solidjs/meta` has no `MetaProvider`. Import `Title`, `Meta`, `Link` directly.
- The `solid/reactivity` lint wants `onClick={() => props.dismiss()}`, not `onClick={props.dismiss}`.
- Effect reads and mutations go through `docs/SOLID-EFFECT-BINDING.md`. `Schema.Class` instances do not survive Solid's SSR serializer; send `Schema.Struct` data.

Diagnostics in component tests (`captureArtifact` from `@solidjs/diagnostics`):

- `toHaveNoDiagnostics()` filters by code and ignores severity, so an `info` record fails it. `OPTIMISTIC_REVERTED` is `info` and fires for the documented `createOptimistic(false)` saving flag. Tests allow it with a comment.
- `HOT_SCOPE_TIME` is a wall-clock budget of 8 ms of compute per 1000 ms window. A shared CI runner overshoots it at random, so component tests allow it (commit 59ef367). Do not restructure markup to satisfy it. To tune it instead, pass `captureArtifact(fn, { attribution: { hotTime: { budgetMs, windowMs } } })`; a raised budget silences it, and `hotTime: false` turns the check off.
- Pick `maxReruns` by running once with a large budget, reading `artifact.attribution.reruns.length`, then setting the budget to that count.

## Alchemy

Read `apps/api/node_modules/alchemy/src` (`lib` is the compiled copy that runs). Key files, all under `src`:

- D1: `Cloudflare/D1/{Database,QueryDatabase,QueryDatabaseLocal,QueryDatabaseHttpClient,ApplyMigrations}.ts`.
- Workers: `Cloudflare/Workers/{Worker,WorkerBridge,RuntimeBindings,RateLimit,WorkerName}.ts`. Vite builds: `Cloudflare/Website/Vite.ts`, `Cloudflare/Workers/{ViteChild,ViteBuildChildRunner}.ts`, `Cloudflare/Workers/Sources/Vite.ts`.
- Other resources: `Cloudflare/R2/`, `Cloudflare/Email/`, `Cloudflare/StateStore/`, `Axiom/{Dataset,Telemetry,ApiToken}.ts`.
- Core: `Stack.ts` (`evalStack`), `Stage.ts`, `RuntimeContext.ts`, `Auth/` and `Cloudflare/Auth/` (profiles and credentials), `Cli/commands/`.
- `@alchemy.run/better-auth` source is in `apps/api/node_modules/@alchemy.run/better-auth/src`.

Credentials. A profile is a file per provider in `~/.alchemy/profiles/<profile>/<provider>.json`, chosen with `--profile` or `ALCHEMY_PROFILE` (default `default`), so every worktree on this box shares it. Providers fall back to environment variables: `CLOUDFLARE_API_TOKEN` with `CLOUDFLARE_ACCOUNT_ID`, and `AXIOM_TOKEN` with `AXIOM_ORG_ID`. CI uses those. Providers resolve credentials when the stack builds, so a provider in `providers` that has none fails every plan. That is why `infra/alchemy.run.ts` adds Axiom only for `production` and `staging`.

State lives in a Cloudflare Secrets Store. A token without Secrets Store access fails at "Computing plan" with a bare 403. The first production deploy also needed Account API Tokens edit (Alchemy mints the bucket-scoped R2 token), D1 edit, Workers scripts and routes, R2, Zone read and DNS edit.

- Leave Worker `name` unset. `createWorkerName` uses an explicit name as written; otherwise it builds a stage-scoped name.
- Read D1 from a script with `Cloudflare.D1.Database.ref("App", { stack, stage })`, `QueryDatabaseLocal` and `evalStack`, as `apps/api/scripts/stage.ts` does. It uses your profile, not `wrangler`.
- `RuntimeContext.phantom` is `Layer.empty` typed as providing `RuntimeContext`. Use it to discharge that requirement in code that only runs inside the Worker (a limiter call, a secret read). It supplies nothing at runtime. Background work uses `Cloudflare.WorkerExecutionContext` and `execution.waitUntil` (`apps/api/src/index.ts`).
- `WorkerBridge.ts` installs `Logger.layer([Logger.consolePretty()])` without `mergeWithExisting`, which drops Effect's `tracerLogger`. `infrastructure/telemetry.ts` adds `Logger.tracerLogger` back so log lines reach spans.
- `ViteBuildChildRunner` sets `disableErrorReporting: true` in beta.81, so a failed Vite build under Alchemy ends as `BundleError: Vite build child exited with code 1:` with nothing after it. Upstream prints the cause from 2026-10-06 (alchemy-run/alchemy#2036), after beta.81. Until you upgrade, reproduce with `vp run --filter @tranzfer/web build` and read its output.
- A green `vp run build` has passed while the Alchemy deploy build failed (PR 101). The PR preview runs the real deploy build; read it before you merge.
- Rate-limit `namespaceId` is unique per Cloudflare account and shared by every stage. `rateLimitBindings` in `apps/api/src/index.ts` is the one list of them; a duplicate id fails typecheck.
- `alchemy state ls`, `cat` and `rm` browse and delete state records without touching cloud resources (https://alchemy.run/cli/inspecting-state). A deploy that failed mid-create left a record that broke the next plan on beta.79; `alchemy state rm tranzfer/<stage>/<Resource>` cleared it.

## drizzle and D1

`drizzle-orm` and `drizzle-kit` are pinned to `1.0.0-rc.5-ab785fc` in the pnpm catalog because Alchemy peers on that exact version. A different version puts a second Alchemy in the lockfile. Source is in `packages/db/node_modules`; docs are at https://orm.drizzle.team/llms.txt.

- Generate migrations with `cd packages/db && vp run generate --name <slug>`. `vp run generate -- --name x` fails with "Unrecognized options" because Vite+ forwards the literal `--`.
- Migration folders are timestamped and each `snapshot.json` names its parents in `prevIds`. Two branches that migrate in parallel fork the chain. `vp exec drizzle-kit check` reports the fork. Delete your folder with `git rm -r` and generate again after rebasing; never edit `snapshot.json`.
- D1 has no interactive transactions. `Database.batch` is the only atomic unit (`packages/db/src/database.ts`). One statement binds at most 100 parameters, so chunk multi-row inserts (`apps/api/src/deliveries.ts`).
- Service tests use a local D1 through wrangler's `getPlatformProxy` (`packages/db/src/testing.ts`). Do not import `miniflare`; its 5.x alpha changed its options.

## Panda CSS

Config is `apps/web/panda.config.ts`. Token unions are in `apps/web/styled-system/types/tokens.d.ts` (regenerated by `panda codegen` on `vp install`). Docs are https://panda-css.com/llms.txt with pages `get-started`, `styling`, `theming`, `design-systems` and `reference` at `https://panda-css.com/llms.txt/<page>`, and everything at `/llms-full.txt` (about 700 KB, search it). The page list in the `panda-css` skill is older. `vp exec panda cssgen --outfile /tmp/x.css` shows the emitted CSS and prints extraction warnings.

- Use the repo's `fontSize` tokens `11 13 15 17 22 26 40`, or `[19px]`. The preset names (`xs`, `md`) also typecheck but set no line height.
- `strictTokens` rejects raw values. Escape with `[...]`, for example `outlineOffset: "[3px]"` and `fill: "[none]"`.
- Inside `[...]` Panda emits the text as written. `[calc(100vh-64px)]` and `[0_0_0_1px_red]` become invalid CSS and the browser drops them. Write real spaces: `[calc(100vh - 64px)]`.
- A nested selector needs `&`. `css({ svg: {...} })` is emitted as a property that never applies; write `"& svg"`.
- `transitionProperty` sets only the property. Add `transitionDuration` and `transitionTimingFunction` or nothing animates. `translateX` sets only `--translate-x`; add `translate: "auto"`.
- Breakpoints nest as `lg` and `lgDown`. `_lg` is not one.
- `cx` joins strings. For a conditional class use Solid's `class={[base, { on: flag() }]}`.
- `jsxStyleProps: "none"` stays set. Without it `<Meta content="...">` is read as the CSS `content` property and breaks the build.
- Tokens go under `theme.extend`. A bare `theme` replaces the preset's tokens. List `presetBase` and `pandaPreset` in `presets`.

## Vite+ (`vp`)

Docs are local: `node_modules/vite-plus/docs` and `node_modules/vite-plus/AGENTS.md`.

- `vp <name>` is a built-in command. `vp run <name>` runs a `package.json` script or task. The "running vp check as a built-in command" note is noise.
- Do not put `--` before script flags: `vp run generate --name x`.
- `vp exec <bin>` finds bins in the current directory's `node_modules/.bin`. From the root `vp exec alchemy` fails; from `infra/` it works.
- `vp install` runs each workspace `prepare`, which writes `styled-system` and `apps/web/file-routes.d.ts`. Run it in every new worktree before `vp check`.
- `vp check --fix` formats, fixes and prints what is left. Run it once.
- Vite+ bundles vitest 5.0.1. The catalog pins `vitest` to match so there is one test runner.

## Uppy

Source is `apps/web/node_modules/@uppy/{core,aws-s3}/lib`. `patches/@uppy__aws-s3@6.2.2.patch` adds `partConcurrency` (default 1) and makes `ListParts` follow `NextPartNumberMarker`; `docs/STACK.md` mentions only the second. Port it with pnpm's patch flow on every Uppy bump.

- `apps/web/src/uploads/uploads.ts` sets `partConcurrency` to 6 because R2 speaks HTTP/1.1 and Chromium opens six connections per origin. Six fill them; more would queue behind the same connections.
- `uppy.upload()` retries every errored file on the instance (`Uppy.js:1491`), not only the one you asked about.

## Better Auth

Source is `apps/api/node_modules/{better-auth,@alchemy.run/better-auth}`. Docs index: https://better-auth.com/docs/llms.txt.

- Hooks and plugin endpoints are Promise callbacks outside the request fiber. Run an Effect from one with `runAuthCallback` in `apps/api/src/infrastructure/auth.ts`. It carries the request's services and abort signal. Do not add a second `AsyncLocalStorage`.
- `testUtils` has no HTTP route, so `apps/api/src/infrastructure/staging-login.ts` is our own key-gated sign-in.

## Browser-only packages in the Worker bundle

`@trev.zip/solid-toast` exports `browser`, `node` and `default` but no `worker` or `workerd` condition, and its browser build calls `createToaster()` when imported. Import it only through `import("../ui/Toasts")` or `clientOnly`. The same applies to any client library imported from a server-rendered module. `solid-js` itself has a `worker` condition.

`filesystem-routing` writes `apps/web/file-routes.d.ts` from `src/routes`. `prerender-crawler` runs inside the Vite build in `hybrid` mode and emits only pages that `emitPages` accepts (`apps/web/vite.config.ts`); its README is in `apps/web/node_modules/prerender-crawler`.

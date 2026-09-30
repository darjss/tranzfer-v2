# Code conventions

Rules for Effect code, Solid glue and tests, taken from the executor reference (`~/dev/tranzfer2-references/apps/executor`, its `.agents/skills/wrdn-*` and `.oxlintrc.jsonc`) and adapted to Solid. Lint enforces some; the rest is judgment. Types and composition edges are in [STRUCTURE.md](STRUCTURE.md).

## Failure

- Failures live in the Effect error channel as tagged errors. `Schema.TaggedError` in `packages/contracts` for wire errors, `Data.TaggedError` inside the API.
- Add an error type only when a caller recovers differently: a distinct UI state, retry rule or status. Otherwise reuse one.
- Build the error at the failure site with `new DomainError(...)`. A helper earns its place by classifying or translating an outside error, not by wrapping a constructor.
- A failing input stays a failure. Never turn it into `false`, `null`, `[]` or `"unknown"` to quiet a type.
- Keep `try/catch`, `throw` and `.catch` at a true adapter edge (a browser API, Uppy callback or Worker entry). Contain it in one function that translates straight into a typed failure, and say so in a one-line comment.
- UI handlers read mutation results as `Exit` from `runPromiseExit` and branch on `Exit.isFailure`. They do not wrap `runPromise` in `try/catch`.

## Unknown data

- Decode untrusted input once, at the boundary, with `Schema.decodeUnknownEffect`. Parse JSON strings with `Schema.fromJsonString(MySchema)`.
- Domain code receives the decoded type. It does not probe `unknown` with `in`, `Reflect.get`, `as unknown as X` or `JSON.parse(...) as X`.
- A cast needs a narrow scope and a comment stating the invariant that makes it true.

## Types come from values

- Schema first: `export type Delivery = typeof Delivery.Type`. No hand-written interface beside a schema that describes the same shape.
- Value first: a service object built by a factory exports `ReturnType<typeof make>`. Keep an explicit interface only when several implementations share it, like `Storage`.
- Skip return annotations. Inference is the source of truth.

## Named workflows

- Every non-trivial Effect is `Effect.fn("Service.method")(function* method() {...})`. The name is the span. Private steps with real logic (`complete`, `settle`) get the same treatment; one-line query helpers do not.
- Sequence with `Effect.gen` or `Effect.andThen`. Check the installed Effect for every API before using it; the pinned prerelease drops and renames names, and `effecttsgo/outdated-api` catches stale ones.

## Running effects

- `runFork`, `runPromise`, `runPromiseExit` and `ManagedRuntime` appear only at edges: the web runtime bridge in `apps/web/src/api`, Uppy and window callbacks, Solid event handlers and actions, tests. Domain code returns Effects.
- HTTP inside `apps/api` goes through Effect's `HttpClient`. Raw `fetch` is allowed where the platform demands it: a Worker `fetch` export, a service-binding call, and browser-only sign-in handlers.

## Structure

- Import another workspace package through its name (`@tranzfer/contracts`), never a relative path across a package root.
- Extract a helper when two callers share behavior, not when two lines look alike. State shared by several views lives in the feature's state module (`dashboard/deliveries.ts`), not in a view.
- Export what other modules read. Setters and internals stay module-private.

## Solid

- State that tracks an in-flight mutation (pending rows, optimistic status) is `createOptimistic` or `createOptimisticStore` inside an `action`. It never sits in a plain signal cleaned up by `try/finally`.
- Reactivity diagnostics are defects. The repair list is in [AGENTS.md](../AGENTS.md#change-and-verify).

## Tests

- Import from `@effect/vitest`, never `vitest`.
- Keep `expect` outside `if`, ternaries and `&&`. Split the cases, or assert the whole value: `expect(result).toEqual({ ok: true })`.
- Time-based rules use `TestClock`. Assert through the service API or the typed client, and read the storage fake only for the storage contract (what was sealed or purged).
- A failing assertion means the product or the test is wrong. Fix one of them; do not weaken the assertion. New test files still need approval ([TESTING.md](TESTING.md)).

## Lint exceptions

An exception is a file-scoped override with a one-line reason, approved by the user. A blanket disable for a rule is a defect.

# Code shape

Where code lives in tranzfer2, and the rules for adding new things. Distilled
from the audits in `~/dev/tranzfer2-references/audits/` — mostly specter,
t3code, opencode, cap, and livestore, filtered down to what a single product
needs (STACK.md's rule: one obvious tool per job, no museum).

## The tree

```
tranzfer2/
├── packages/
│   ├── contracts/src/
│   │   ├── index.ts                # public barrel: groups + errors + types
│   │   ├── errors/                 # Schema.TaggedError, one file per domain
│   │   │   ├── transfer.ts
│   │   │   └── auth.ts
│   │   ├── types/                  # shared DTOs, one file per domain
│   │   │   ├── transfer.ts         # Transfer, Delivery, Part
│   │   │   └── auth.ts             # Session, Principal
│   │   ├── transfer.ts             # TransferRpcs group: create/sign/complete/abort
│   │   └── auth.ts                 # auth-facing ops (if they ride RPC)
│   │
│   ├── db/src/
│   │   ├── schema.ts               # drizzle tables + relations
│   │   ├── client.ts               # D1Client service (effect-cf D1.sqlLayer)
│   │   └── migrations/             # drizzle-kit output
│   │
│   └── upload-core/src/
│       ├── session.ts              # UploadSession, UploadState (tagged enum)
│       ├── plan.ts                 # MultipartPlan: chunk sizing, part math
│       ├── progress.ts             # UploadProgress, ETA math
│       └── errors.ts               # upload domain errors
│
├── apps/
│   ├── api/src/
│   │   ├── index.ts                # Worker.make + fetch dispatch ONLY (~60 lines)
│   │   ├── env.ts                  # Config + env validation
│   │   ├── runtime.ts              # Layer.mergeAll — THE composition root
│   │   ├── handlers/
│   │   │   ├── transfer.ts         # TransferRpcs.toLayer implementation
│   │   │   └── auth.ts             # better-auth route adapter
│   │   ├── services/
│   │   │   ├── signing.ts          # presign R2 ops (Distilled S3)
│   │   │   ├── transfers.ts        # transfer lifecycle logic
│   │   │   └── auth.ts             # session/principal resolution
│   │   ├── repos/
│   │   │   └── transfers-repo.ts    # drizzle queries, Database.use shape
│   │   └── middleware.ts           # auth middleware, error mapping
│   │
│   └── web/src/
│       ├── api/
│       │   ├── client.ts           # RpcClient service + WebLayer
│       │   ├── runtime.ts          # ManagedRuntime frozen into context
│       │   └── solid-effect.ts     # runEffect + effectAction binding
│       ├── state/
│       │   ├── transfer-store.ts   # createStore + pure reducers
│       │   └── uppy-bridge.ts      # Uppy events -> store writes (isolated)
│       ├── features/
│       │   ├── send/               # the send flow (components + local state)
│       │   └── transfers/          # transfer list/detail
│       ├── ui/                     # kobalte wraps + styled primitives
│       └── routes/                 # file routes
│
└── infra/alchemy.run.ts            # unchanged
```

## The rules

These are the whole design. Everything else follows.

**1. contracts owns the wire.** Every operation is `Rpc.make` in a `RpcGroup`
in contracts. Schemas for payload/success/error live beside it. Contracts
imports Schema and nothing else — no drizzle, no handlers, no bindings
(t3code's `packages/contracts`, effect-app's `resources/`).

**2. One composition root.** `apps/api/src/runtime.ts` is the only
`Layer.mergeAll`. New service = new file in `services/` + one line in
runtime.ts (opencode's app-runtime pattern, minus their DAG machinery).

**3. Services are Context.Service classes with a static layer:**

```ts
// services/signing.ts
export class Signing extends Context.Service<Signing, {
  presignPart: (args) => Effect.Effect<PresignedUrl, SigningError>
}>()("tranzfer/Signing") {
  static layer = Layer.effect(this, Effect.fn("Signing.make")(function*() {
    const config = yield* SigningConfig
    return { presignPart: (args) => ... }
  }))
}
```

From dfx/livestore/effect-solutions. `Tag.of` for test stubs, `use` for call
sites when a service is read often.

**4. Handlers are thin, and resolve deps once.** `RpcGroup.toLayer` accepts
an `Effect` returning the handler map, so shared services are yielded a
single time at layer build instead of inside every op:

```ts
export const TransferHandlers = TransferRpcs.toLayer(
  Effect.gen(function*() {
    const repo = yield* TransfersRepo
    const auth = yield* Auth
    return {
      ListTransfers: () =>
        repo.listRecent(auth.principal.id).pipe(
          Effect.mapError((e) => new TransferUnavailable({ ... })),
        ),
    }
  }),
)
```

`yield*` isn't manual wiring, it reads a service out of the context and the
type system tracks it on `R`. The layer's `R` is what `runtime.ts` must
satisfy — that's the injection. Same one level down: a repo's
`yield* D1Client` sits inside `Layer.effect`, which also runs once at layer
build, and every method closes over `db`. If an op needs an extra service
anyway, `yield*` inside it still works; it's a context read, not a
declaration. `Effect.all({ auth: Auth, repo: TransfersRepo })` grabs several
in one shot.

Capture the service, not request state. Reading `auth.principal` inside the
op keeps it per-call; hoisting `const principal = auth.principal` into the
gen would freeze one requester's identity into every handler.

**5. Repos are drizzle + nothing else.** `D1Client` resolves once in the
layer gen and every method closes over it:

```ts
export class TransfersRepo extends Context.Service<
  TransfersRepo,
  {
    listRecent: (id: string) => Effect.Effect<Transfer[], TransferDbError>;
    findById: (id: string) => Effect.Effect<Transfer, TransferDbError>;
    markFinalized: (id: string) => Effect.Effect<void, TransferDbError>;
  }
>()("tranzfer/TransfersRepo") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const db = yield* D1Client;
      return {
        listRecent: (id) => db.query.transfers.findMany({/* ... */}),
        findById: (id) => db.query.transfers.findFirst({/* ... */}),
        markFinalized: (id) => db.update(transfers).set({/* ... */}),
      };
    }),
  );
}
```

No repository interface abstraction, no `BaseRepository<T>` — cap's
`Database.use(cb)` is 17 lines and that's the whole pattern. For reads prefer
drizzle's relational API (`db.query.transfers.findMany({ where, orderBy,
limit })`) once `relations` are declared in `schema.ts`; keep `db.select()`
for joins and aggregates. Each method maps its own errors to
`TransferDbError`.

**6. Errors are Schema.TaggedError, declared per-op.** Domain errors in the
service file they belong to; only wire-safe fields on contract errors
(`code`, `message`, `requestId`, `retryable`). Defects never cross
(specter/herdr convention).

**7. The web app's API layer is the official binding.** `api/client.ts`
builds the `RpcClient` inside the app's Effect layer, `api/runtime.ts`
freezes a `ManagedRuntime` into Solid context (omnidraw's pattern). The
bridge itself is the ~90-line official example from
`solid/examples/effect` (`api/solid-effect.ts`): `runEffect` adapts an
Effect to the `AsyncIterable` Solid 2 consumes natively, so pending goes to
`<Loading>`, failure to `<Errored>`, and a superseded flight interrupts the
fiber. `effectAction` writes mutations as Effect sagas inside `action`. No
`[error, value]` tuple wrappers — see `SOLID-EFFECT-BINDING.md`.

**8. Uppy is wrapped, not spread.** `state/uppy-bridge.ts` is the only file
that imports `@uppy/*`. It owns the Uppy instance, subscribes to its events,
and writes into `transfer-store` via pure reducers (pim-agent's class-store +
reducers, melty-karts' observer-gated bridging). Components read the store,
never Uppy.

**9. Solid 2 idioms only.** `createMemo(async)` + `<Loading>`/`<Errored>` for
reads, `action`/`createOptimistic` for mutations, `onSettled` for lifecycle,
two-arg `createEffect(compute, apply)` for subscriptions. No `createResource`
(v2 removed it).

**10. Forms are hand-rolled field state.** No Solid 2 form lib is ready:
`@tanstack/solid-form` allows `solid-js@2` by peer range but is unverified on
the new reactivity (STACK.md already gates it on verification), formisch caps
at `<2`, modular-forms is v1-only. Our forms are small — email, password,
expiry. Use a local `createStore` for values/touched/errors, Effect Schema for
submit validation, and Kobalte/quoin `Field` primitives for label/error
wiring. Revisit TanStack Form when its v2 adapter is confirmed.

**11. Per-request fresh MemoMap on the Worker.** Executor and effect-app both
hit this footgun: `Effect.provide` inside a request leaks the parent fiber's
MemoMap. `runtime.ts` builds the layer once; request-scoped work gets
`{ local: true }` or a fresh `Layer.makeMemoMap`.

## Naming

- Services: `kebab-case.ts` in `services/`, tag `"tranzfer/Name"`.
- RPC groups: one per domain in contracts (`TransferRpcs`, `AuthRpcs`), not
  one giant `Api` group once we have two domains (t3code splits this way).
- Repos: `x-repo.ts`.
- Solid feature folders own their components, state, and styles — no global
  `components/` dumping ground until reuse is real (STACK.md rule).
- Test colocation: `x.test.ts` beside `x.ts`.

## What this deliberately skips

- No LayerNode DAG (opencode), no query DSL (effect-app), no event sourcing
  (specter), no client cache envelopes (effect-app). If a second consumer
  (desktop app) shows up, revisit.
- No `resources/` folder ceremony — contracts/src files ARE the contract.
- No Uppy Dashboard, no second upload framework (STACK.md already rules this).

## Growth path

When a `services/X.ts` crosses ~300 lines it becomes `services/X/index.ts`
plus siblings (`X/presign.ts`, `X/complete.ts`) — cap's `Storage/` does this
(`signed-object.ts`, `storage-repo.ts` beside `index.ts`). Not before.

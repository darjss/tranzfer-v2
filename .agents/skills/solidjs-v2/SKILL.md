---
name: solidjs-v2
description: Write, edit, or explain SolidJS 2.x code, including reactivity, async state, stores, DOM, SSR, and server functions. Apply only when the installed solid-js major version is 2.
---

# SolidJS 2.0

Solid 2.0 differs from React and Solid 1.x in its component, reactivity, and
async contracts. Check the installed package before relying on memory or this
skill's rc.5 reference material.

## Read installed documentation first

Read `node_modules/solid-js/package.json` to confirm the installed version.
Apply this skill only to Solid 2.x. Check the application's `tsconfig.json` for
its JSX import source. Resolve these paths from the package owning the code;
workspace dependencies may be installed there rather than at the repository root.

Before answering or editing, read the relevant sections of
`node_modules/solid-js/CHEATSHEET.md`. This is the version-matched guide.
Confirm signatures and exports in the installed `solid-js` and `@solidjs/web`
packages. Use their runtime when declarations cannot establish behavior.

The references below describe rc.5. Consult them for additional explanation,
then verify any version-sensitive claim against the installed package. They do
not override installed documentation, declarations, or observed runtime behavior.

For a dev diagnostic code, read
`node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`. For reactive
rerun or cost evidence, read
`node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`.

## Work process

For explanations, finish when the requested behavior is explained using installed
sources, with any unverified behavior identified. Run a focused runtime check
only when the sources leave a material question unresolved.

For code changes:

1. Read the installed documentation and routed references for the affected
   behavior. Before editing, identify each changed value's source, tracking
   scope, and lifetime owner. For mutable state, also identify its write sites.
2. Implement the requested behavior. This step ends when those relationships
   are accounted for and the requested flow has no placeholder branch.
3. Exercise the affected behavior and run the project's required checks. Resolve
   relevant diagnostics with the installed repair guide. For changes to reactive
   behavior or performance, capture evidence with the installed agent-loop guide.
   Finish when the affected behavior and required checks pass and no relevant
   diagnostic remains. Report pre-existing failures and unverified behavior
   explicitly instead of claiming they passed.

## The ten rules that prevent most bugs

1. **Reads lag writes.** Updates apply on the next microtask:
   `setCount(1); count()` still returns `0`. Synchronous point: `flush()`.
   `batch()` does not exist.
2. **`createEffect` takes two functions** — `(compute, apply, options?)`.
   Compute tracks and returns a value; apply does side effects (untracked) and
   may return a cleanup. The 1.x single-callback form throws. `on()`,
   `createComputed`, initial-value args: all gone.
3. **Never write signals/stores or invoke an action inside a reactive scope**
   (memo, compute, component body) — throws in dev. Define actions there if
   useful, but invoke/write from event handlers, effect callbacks, actions, or
   `onSettled`. `untrack()` suppresses read tracking but does not exempt writes.
   Derive instead of writing back.
4. **No top-level reactive reads in component bodies** and no destructured
   props — warns, value goes stale. Read via `props.x` inside JSX / memos /
   effect computes; `untrack(() => ...)` for deliberate one-shots.
5. **Value props receive values.** Call site: `<X v={count()} />`. Child:
   `props.v`, without destructuring. This stays
   reactive — the compiler turns `v={count()}` into `{ get v() { return count() } }`,
   so reading `props.v` in the child re-runs `count()` in the child's tracking
   scope. Pass an accessor only when the component's declared contract requires
   one, such as an intentionally lazy callback prop.
6. **Async is just a computation**: `const user = createMemo(() => fetchUser(id()))`
   — no `createResource`. Wrap consumers in `<Loading fallback={...}>`;
   errors go to `<Errored>`. In-flight-change indicators: `isPending(() => user())`
   — fires for changed inputs and `affects()` declarations; a bare `refresh()`
   is normally quiet. `await refresh(source)` waits for the settled re-ask;
   `until(predicate)` waits for a truthy live-source acknowledgement.
7. **Store setters take a draft**: `setStore(s => { s.a.b = 1; })` (produce is
   the default). Store APIs (`createStore`, `reconcile`, `snapshot`…) are
   exported from `solid-js` — `solid-js/store` does not exist.
8. **List rendering is `For` with keying modes** — `<Index>` is gone. Callback
   shapes differ per mode (see references); `keyed={false}` gives
   `(itemAccessor, plainIndex)`. Fixed-count rendering: `<Repeat>`.
9. **Lifecycle**: `onSettled(() => { ...; return cleanup; })` replaces
   `onMount`/`onCleanup` for component-level setup-and-teardown. It's a leaf
   owner — no primitives or `onCleanup` inside.
10. **Imports moved**: `@solidjs/web` for `render`/`hydrate`/`Portal`/`Dynamic`
    (not `solid-js/web`); `jsxImportSource: "@solidjs/web"`; DOM attributes are
    lowercase (`tabindex`); `class` takes object/array forms (`classList` is
    gone); directives are `ref={factory(opts)}` (`use:` is gone).

## Reference routing

Read the file matching the task before writing code in that area:

| Task touches                                                                                                                                                                                         | Read                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Quick API lookup or import list                                                                                                                                                                      | `node_modules/solid-js/CHEATSHEET.md` first; use `references/cheatsheet.md` only for rc.5 background |
| Signals, memos, split/render effects and paint timing, `createReaction`, batching/flush, lifecycle, ownership, dev diagnostics                                                                       | `references/reactivity.md`                                                                           |
| Data fetching, loading values, async iterator completion, Loading/Errored, isPending/latest/resolve/awaitable refresh/until, action call scope/errors, optimistic UI                                 | `references/async-and-actions.md`                                                                    |
| createStore, reconcile, projections, nested store-view structural tracking, compiler patch-driver boundary, snapshot/deep, merge/omit, storePath                                                     | `references/stores.md`                                                                               |
| For/Repeat/Show/Switch/Reveal, dynamic/lazy components, lazy SSR/hydration identity, class/attributes/events/refs/directives, render entries                                                         | `references/control-flow-and-dom.md`                                                                 |
| tsconfig, JSX types, import paths, Context typing, test setup                                                                                                                                        | `references/typescript-setup.md`                                                                     |
| Composed patterns: SWR query, optimistic mutations, selection projections, global state, demand-driven resources                                                                                     | `references/patterns.md`                                                                             |
| Naming a primitive/composable (`create*` vs `use*`), cross-cutting conventions                                                                                                                       | `references/conventions.md`                                                                          |
| `"use server"` directive, module/function wrappers, server-function addressing/invoke/live, respond/redirect/reload, GET/withMeta, fetch/prepareRequest, named single-flight, no-JS, getRequestEvent | `references/server-functions.md`                                                                     |
| Experimental server components, frames, client slots/state preservation, `installServerComponents`, `serverFunctions: { components: true }`                                                          | `references/server-components.md`                                                                    |

## Failure modes

- **App renders nothing / mount seems stuck** → pending async outside a
  `Loading` boundary defers the root mount; check the console for
  `ASYNC_OUTSIDE_LOADING_BOUNDARY`.
- **Dev throws/warns with a diagnostic code** (`REACTIVE_WRITE_IN_OWNED_SCOPE`,
  `STRICT_READ_UNTRACKED`, …) → read the installed
  `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` and apply its
  prescribed repair.
- **Test asserts stale values** → missing `flush()` after writes, or reactive
  code created without an owner (`createRoot` in tests).
- **An API from docs/examples doesn't exist** → prereleases drift; verify against
  installed typings and prefer them over any doc, including these references.

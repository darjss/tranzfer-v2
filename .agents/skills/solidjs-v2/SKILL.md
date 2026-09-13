---
name: solidjs-v2
description: Write, edit, or explain SolidJS 2.x code, including reactivity, async state, stores, DOM, SSR, and server functions. Apply only when the installed solid-js major version is 2.
---

# SolidJS 2.0

Solid 2.0 differs from React and Solid 1.x in its component, reactivity, and
async contracts. Check the installed package before relying on memory or this
skill's rc.5 reference material.

## Step 0 — confirm this is actually a v2 project

Check before applying anything below:

- `package.json`: `solid-js` major is `2` (e.g. `2.0.0-rc.x`), and/or
  `@solidjs/web` is a dependency.
- `tsconfig.json`: `"jsxImportSource": "@solidjs/web"`.

If `solid-js` is `1.x` (imports like `solid-js/web`, `solid-js/store`), **stop —
these rules do not apply**; that's a Solid 1.x project. If the task is to
convert it, use the `solidjs-v2-migration` skill instead.

This project uses rc.6. Its installed sources are authoritative, in this order:

1. Public typings and package exports in `node_modules/solid-js` and
   `node_modules/@solidjs/web`.
2. Runtime behavior when the typings do not settle the question.
3. `node_modules/solid-js/CHEATSHEET.md` for the package's version-matched API
   guide.
4. This skill's references, which were written against rc.5.

For a dev diagnostic code, read
`node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`. For reactive
rerun or cost evidence, read
`node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`.

## Work process

1. Confirm the installed Solid version, JSX import source, and public exports
   touched by the task. This step ends when each API to be used exists in the
   installed package.
2. Read every routed reference that matches the changed behavior. For each
   changed reactive value, identify the scope that reads it, the event or action
   that writes it, and the owner that controls its lifetime before editing.
3. Implement the smallest complete behavior. This step ends when every changed
   value has an explicit read, write, and lifetime path and the affected user
   flow has no placeholder branch.
4. Exercise the affected behavior and run the project's required checks. Resolve
   relevant Solid diagnostics with the bundled repair guide. For a reactivity or
   performance change, capture rerun evidence with the bundled agent-loop guide.
   Work is complete when the behavior passes, required checks pass, and no
   relevant diagnostic remains. Report any behavior that could not be exercised.

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
  `STRICT_READ_UNTRACKED`, …) → table of codes and fixes at the bottom of
  `references/reactivity.md`. Fix the cause; never silence with `ownedWrite`
  for app state.
- **Test asserts stale values** → missing `flush()` after writes, or reactive
  code created without an owner (`createRoot` in tests).
- **An API from docs/examples doesn't exist** → prereleases drift; verify against
  installed typings and prefer them over any doc, including these references.

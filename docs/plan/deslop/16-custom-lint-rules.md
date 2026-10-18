# Plan 16: Lint rules that stop the patterns found in this audit from coming back

> **Executor instructions**: The rule ships in the PR that clears its hits, at `error`, never `warn`. Built-in rules go straight into `lint.config.ts`. Keep lint enabled; an exception needs user approval, a file-scoped override and a one-line reason. Work in a worktree off current `origin/dev`.

## Status

- **Priority**: P2 | **Effort**: S | **Risk**: LOW | **Depends on**: the split of the files below | **Category**: dx
- R0 and R1-R8 shipped. R9 is the only rule left.

## The rule

| ID  | Rule and pattern                                                                                                                                                             | Hits today (non-blank lines, comments included)                                                                                     | Fix it points to |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| R9  | core `max-lines`: `["error", { max: 600, skipBlankLines: true, skipComments: true }]` for non-test `apps/**/src`, with a file-scoped override for generated or content files | 4 files over: `uploads/uploads.ts` 1044, `marketing/content.ts` 800, `api/src/deliveries.ts` 752, `dashboard/DeliverySheet.tsx` 634 | split the files  |

`marketing/content.ts` is copy, so it is the candidate for the file-scoped override. The other three need splitting before the rule can land at `error`.

## Done criteria

- [ ] `max-lines` is in `lint.config.ts` at `error` with 0 hits
- [ ] `vp check` exits 0

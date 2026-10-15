# Plan 16: Lint rules that stop the patterns found in this audit from coming back

> **Executor instructions**: This file is the spec for each rule; the rule itself ships in the PR of the plan that clears its hits, at `error`, never `warn`. Custom rules go in `tools/oxlint/anti-slop/tranzfer/` (`index.ts` with `eslintCompatPlugin`, `rules/*.ts` with `defineRule`, the same shape as `anti-slop/effect/`), each with a RuleTester test next to it. That supersedes the `lint/tranzfer-plugin.mjs` path and the warn-first steps below. Keep lint enabled; an exception needs user approval, a file-scoped override and a one-line reason. Work in a worktree off current `origin/dev`.
>
> **Drift check (run first)**: `git diff --stat 0a61bc5..HEAD -- lint.config.ts apps/api/lint.config.ts apps/web/lint.config.ts`. Then re-count each rule's "hits today" with the command in its row; a count that differs by more than 20% = STOP and re-plan that rule.

## Status

- **Priority**: P2 | **Effort**: M (one PR for the plugin + config, then one tiny PR per rule flipped to `error`) | **Risk**: LOW | **Depends on**: land last. Rules R1-R2 should flip to `error` after plan 02; R4-R5 after 05; R6 after the founder picks a style; R8a after 07; others anytime | **Category**: dx
- **Planned at**: commit `0a61bc5`, 2026-10-12

## Why this matters

The repo already lints hard: `lint.config.ts` extends `ultracite` core and the vendored `anti-slop` preset (type-assertion, `unknown` and Reflect rules), the `effecttsgo` Effect rules for `apps/api`, and `eslint-plugin-solid` strict for the web. That is why real casts are nearly extinct (one `as` outside `as const`, `apps/api/src/infrastructure/r2.ts:24`). What it does not catch is this codebase's own recurring drift: SQL written in strings, ids typed as `string`, the same expression pasted into 17 places, docs that say one style while the code uses another. Each rule below names the pattern, the file where it lives today, and how many hits exist now.

## Mechanism (checked in the repo)

- `lint.config.ts` is built with `defineConfig` from `oxlint` and already loads JS plugins: `jsPlugins: [vitePlusPlugin, ...(antiSlop.jsPlugins ?? [])]`. The anti-slop plugin source (`node_modules/.pnpm/ultracite@7.12.2.../config/oxlint/anti-slop/plugin.mjs`) shows the rule shape: `defineRule({ meta: { type, docs, messages }, createOnce(context) { return { TSAsExpression(node) { context.report({ node, messageId }) } } } })`.
- `defineRule` comes from `@oxlint/plugins` (in the pnpm store at 1.79.0). Install it with the package manager, not by editing `package.json`: `vp add -D -w @oxlint/plugins`.
- oxlint has `no-restricted-imports`, `max-lines`, `no-restricted-globals` built in; it has no `no-restricted-syntax`, which is why the pattern rules need a plugin.
- The new plugin file: `lint/tranzfer-plugin.mjs` at the repo root, registered next to the others: `{ name: "tranzfer", specifier: "./lint/tranzfer-plugin.mjs" }` (relative to `lint.config.ts`; if oxlint wants an absolute path, use `fileURLToPath(new URL("./lint/tranzfer-plugin.mjs", import.meta.url))` as `ultracite` does).

## Gap in the existing config (do this first, no plugin needed)

`lint.config.ts:152-168` (`rootLint`) applies the `effecttsgo` error rules (`floating-effect`, `missing-star-in-yield-effect-gen`, `outdated-api`, `try-catch-in-effect-gen`, ...) only to `paths.api` = `apps/api/**`, `e2e/**`, `packages/contracts/**`. The Effect code in `packages/db/src` and in the web (`apps/web/src/api`, `uploads`, `downloads`, `dashboard`, about 24 files with `Effect.gen`/`Effect.fn`) only gets the relaxed promise rules from `paths.effect`. Add `packages/db/**` and those four web directories to the `api` list (and `webLint`'s `api: []` at `:175-183` if `webLint` is used by `apps/web`). Expect a short cleanup pass; the rules are mechanical. This is R0.

## The rules

| ID  | Rule and pattern                                                                                                                                                                                                                                                                                                                     | Hits today (command)                                                                                                                | Fix it points to                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| R1  | `tranzfer/no-table-names-in-sql`: a `sql` tagged template whose text has `FROM <bare identifier>` (not `${...}`, `json_each`, or `(select 1)`)                                                                                                                                                                                       | 4: `rg -n 'FROM [a-z_]+' apps/api/src \| rg 'sql' ` (`transfers.ts:196,197`, `deliveries.ts:669,775`)                               | `exists(db.select(...))` (plan 02)      |
| R2  | `tranzfer/no-count-subquery-string`: `sql` template containing `select count(*)`                                                                                                                                                                                                                                                     | 4 (`deliveries.ts:74`, `emails.ts:233,234`, `infrastructure/auth.ts:108`)                                                           | `db.$count(...)`                        |
| R4  | `tranzfer/branded-user-id`: an identifier or property named `senderId`, `ownerId` or `userId` annotated `: string` (excluding `*.test.ts` and `apps/api/scripts`)                                                                                                                                                                    | 53 (`rg -c '(senderId\|ownerId\|userId): string' apps/api/src`)                                                                     | `UserId` (plan 05)                      |
| R5  | `tranzfer/branded-link-token`: in `packages/contracts/src`, an object property named `token` or `unlock` whose value is a bare `Schema.String`                                                                                                                                                                                       | 10 (`api.ts` x6, `request.ts` x3, `upload.ts`, `link.ts`)                                                                           | `LinkToken`/`UnlockToken` (plan 05)     |
| R6  | `tranzfer/schema-type-style`: `interface X extends Schema.Schema.Type<typeof X>`; autofix to `type X = typeof X.Type`. **Founder decision**: `docs/CONVENTIONS.md` ("Types come from values") and the executor reference use the `type` form, 20 files here use `interface`; either change the doc or the code, then lint the winner | 20 (`rg -n 'interface \w+ extends Schema.Schema.Type' apps packages`)                                                               | `type X = typeof X.Type`                |
| R7  | `tranzfer/no-silent-ignore`: `Effect.ignore` used without `{ log: true }` (installed signature: `ignore(effectOrOptions?, options?: { log?: boolean \| Severity; message?: string })`, `Effect.ts:7922`)                                                                                                                             | 5 (`billing.ts:276,310`, `save-folder.ts:245`, `uploads.ts:726`, `routes/d/[token].tsx:346`)                                        | `Effect.ignore({ log: true, message })` |
| R8a | core `no-restricted-imports` override for `apps/api/src/infrastructure/**`: no imports from `../deliveries`, `../emails`, `../transfers`, `../plans`, `../billing`, `../shared-links`, `../file-requests` (STRUCTURE.md: infrastructure sits under the domain)                                                                       | 2 (`auth.ts:30,31`)                                                                                                                 | plan 07                                 |
| R8b | `no-restricted-imports` for `apps/web/src/**`: `@tranzfer/db`, `drizzle-orm*`, `alchemy*`                                                                                                                                                                                                                                            | 0                                                                                                                                   | keeps it 0                              |
| R8c | `no-restricted-imports` for `packages/contracts/src/**`: `@tranzfer/db`, `drizzle-orm*`, `alchemy*`, `cloudflare:*` (STRUCTURE.md: contracts imports no handlers, database or bindings)                                                                                                                                              | 0                                                                                                                                   | keeps it 0                              |
| R9  | core `max-lines`: `["warn", { max: 600, skipBlankLines: true, skipComments: true }]` for non-test `apps/**/src`, with a file-scoped override for generated or content files                                                                                                                                                          | 4 files over: `uploads/uploads.ts` 1038, `marketing/content.ts` 806, `api/src/deliveries.ts` 806, `dashboard/DeliverySheet.tsx` 622 | plans 09, 15                            |

Not proposed, deliberately: a rule against `Effect.die(new Error(...))` (10 sites). Effect 4.0.1 has no `Effect.dieMessage`, and those sites are real invariants (a delivery without a link, a stored hash that is malformed), which should die. A rule against `as` is already covered by anti-slop.

## Steps

1. `vp add -D -w @oxlint/plugins`. Create `lint/tranzfer-plugin.mjs` exporting a plugin object `{ meta: { name: "tranzfer" }, rules: { ... } }` (use `eslintCompatPlugin` as the anti-slop bundle does if rules use `create` rather than `createOnce`).
2. Implement R1-R3 first, as in this sketch (R1):
   ```js
   import { defineRule } from "@oxlint/plugins";
   const FROM_BARE = /\bfrom\s+(?!json_each\b|\(|\$\{)["`]?[a-z_]+/i;
   export const noTableNamesInSql = defineRule({
     meta: {
       type: "problem",
       docs: { description: "Table names inside sql strings break silently on rename." },
       messages: {
         bare: "Use exists()/notExists() or a query builder so the table name is checked by the type system.",
       },
     },
     createOnce(context) {
       return {
         TaggedTemplateExpression(node) {
           if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
           if (node.quasi.quasis.some((q) => FROM_BARE.test(q.value.cooked ?? q.value.raw)))
             context.report({ node, messageId: "bare" });
         },
       };
     },
   });
   ```
   R2, R3 are the same shape with different regexes (`/select\s+count\(\*\)/i`, `/unixepoch\(/i` with an allowlist for the file that defines `nowMs`).
3. Implement R4-R7 on the AST: R4 matches `Identifier` params and `TSPropertySignature`/`PropertyDefinition` with `typeAnnotation.typeAnnotation.type === "TSStringKeyword"` and a name regex; R5 matches `Property` nodes with key `token`/`unlock` and value `MemberExpression Schema.String`; R6 matches `TSInterfaceDeclaration` whose `extends[0]` is `Schema.Schema.Type<typeof X>`; R7 matches `CallExpression` of `Effect.ignore` or `.pipe(Effect.ignore)`.
4. Register the plugin and rules in `lint.config.ts` at `warn`, scoped with `overrides[].files` (R4 `apps/api/src/**`, R5 `packages/contracts/src/**`, R1-R3 `apps/api/src/**` and `packages/db/src/**`). Add R8-R9 with the built-in rules in the same overrides block.
5. **Verify**: `vp lint` prints exactly the "hits today" counts (+/- the files you excluded). Paste the per-rule counts in the PR.
6. As each cleanup plan lands, flip its rules to `error` in a one-line PR (the count must be 0). Never add a blanket disable; an exception is a file-scoped override with a reason, approved by the user.

## Test plan

No test files (AGENTS.md). Each rule is checked by its "hits today" count and by running `vp lint` on a scratch file under `/tmp` (outside the repo) that contains one positive and one negative example, via `vp lint --config lint.config.ts /tmp/lint-scratch.ts` if the CLI accepts out-of-tree paths; otherwise skip this check and rely on counts.

## Done criteria

- [ ] `vp lint` exits 0 (all new rules at `warn`) and prints the expected per-rule counts
- [ ] `vp check` exits 0
- [ ] `rg -n "tranzfer/" lint.config.ts` lists R1-R7; R8-R9 appear as built-in rules

## STOP conditions

- oxlint 1.85.0 rejects a relative `specifier` or a `createOnce` rule in this repo's plugin setup; report the exact error.
- A rule's count is 3x the number above (the regex or selector is too broad): tighten before enabling.
- Lint time on `vp check` rises by more than ~15% (JS plugins are slower; anti-slop already pays that cost).

## Maintenance notes

New rules need a "hits today" line and a named fix in the PR, or they become noise. When plan 05 lands, R4/R5 should be `error` the same day.

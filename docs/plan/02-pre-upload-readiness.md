# Follow-up work

These tasks do not block the [first complete transfer](01-foundation.md).

- Add schema-rejection and interrupted-first-request checks for RPC.
- Extend CI with browser/runtime smoke checks and failure injection when there are stable product flows to exercise. Run tests when they exist; do not claim empty runs as coverage.
- Verify Kobalte or form-adapter compatibility when an upload screen needs those controls. Avoid preparing an unused component library.
- Revisit dependency patches when the relevant upstream fixes are released.
- Inspect and remove orphaned pre-migration infrastructure separately after confirming it contains no required data.

Record implementation evidence in PRs and remove completed items here.

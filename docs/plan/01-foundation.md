# Resume after refresh

Finish the transfer flow. Read [RELIABILITY.md](../RELIABILITY.md) before transfer code. Optional tooling and UI follow-up in [02-pre-upload-readiness.md](02-pre-upload-readiness.md) does not block this milestone.

- Restore a transfer after refresh. Persist its identity (transfer id, multipart upload id, part size, file fingerprint) in IndexedDB before relying on it. On return, recover file access or ask for reselection, verify the fingerprint, reconcile remote parts with a `List` signature and continue from the first missing part.
- Keep the exact `CreateDelivery` payload until the response arrives, so a retry after a lost response replays the same ids instead of creating a second delivery.
- Reconcile a lost `Complete` response before retrying transport: ask the server for the transfer state first, and refresh the dashboard until it settles.
- Pass the 10 GB internal gate, then the 100 GB and 350 GB gates. Record correctness, avoidable bytes resent and manual intervention in the PR or issue.

Build only the UI controls this flow needs. Run existing tests and direct runtime checks. New test files still require explicit approval.

# Resume after refresh

Finish the transfer flow. Read [RELIABILITY.md](../RELIABILITY.md) before transfer code. Optional tooling and UI follow-up in [02-pre-upload-readiness.md](02-pre-upload-readiness.md) does not block this milestone.

Remaining work:

- Pass the 10 GB internal gate, then the 100 GB and 350 GB gates. Record correctness, avoidable bytes resent and manual intervention in the PR or issue.
- Restore persistent `FileSystemFileHandle`s where Chromium supports them, so a refresh needs no reselection.
- Cross-tab ownership (e.g. Web Locks), so a second tab doesn't offer to resume an upload another tab is running.
- Upstream the Uppy `ListParts` pagination fix and drop the patch.

Run existing tests and direct runtime checks. New test files still require explicit approval.

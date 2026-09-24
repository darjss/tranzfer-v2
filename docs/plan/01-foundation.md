# First complete transfer

Build one working file-delivery flow. Read [RELIABILITY.md](../RELIABILITY.md) before transfer code. Optional tooling and UI follow-up in [02-pre-upload-readiness.md](02-pre-upload-readiness.md) does not block this milestone.

- Authorize an upload, persist its identity and start Uppy multipart transport directly to R2. Configure the required R2 CORS rules.
- Restore a transfer after refresh. Recover file access or ask for reselection, verify identity, reconcile remote parts and continue the existing upload.
- Make finalization safe to repeat when its successful response is lost.
- Give the recipient an authorized link that downloads the correct file. Define expiry and download-recovery behavior.
- Implement explicit cancellation and expiry cleanup without conflating them with UI disposal.
- Pass the 10 GB internal gate, then the 100 GB and 350 GB gates. Record correctness, avoidable bytes resent and manual intervention in the PR or issue.

Build only the UI controls this flow needs. Run existing tests and direct runtime checks. New test files still require explicit approval.

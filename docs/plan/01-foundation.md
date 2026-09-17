# First complete transfer

The foundation phase is closed. This file keeps the one deferred milestone:
the first transfer flow, which starts after
[02-pre-upload-readiness.md](02-pre-upload-readiness.md) passes its gates.

Read `../SOUL.md` for the product, `../STACK.md` for package ownership and tool
choices, and `../RELIABILITY.md` before implementing transfer behavior. Read the
project's Solid 2 skill before changing Solid code. Use installed documentation
and package types to verify version-sensitive behavior.

## Milestone

Use the deployed infrastructure and the reliability contract to implement one
complete flow:

1. An authenticated creator selects a file and uploads it directly to R2 using
   multipart uploads through Uppy.
2. Durable metadata preserves the upload identity. Refresh recovery restores
   file access or requests reselection, verifies the source, reconciles remote
   parts, and continues the existing upload.
3. Finalization recovers safely when a successful response is lost.
4. The recipient opens an authorized link and downloads the correct file.
5. Expiration and explicit cancellation clean up storage intentionally.

Resolve source-file verification and recipient download recovery explicitly.
Uploading an object to R2 alone does not complete delivery.

Complete the 10 GB release gate in RELIABILITY.md first, then progress to its
100 GB and 350 GB gates. Record correctness, avoidable bytes resent, and manual
intervention. Run existing tests and direct runtime checks; obtain explicit
approval before creating new test files, as required by the repository rules.

# Transfer reliability

Read this before changing uploads, recovery, downloads, cancellation or expiry. These are acceptance rules, not claims that the product has already passed them.

## Ownership and durable truth

R2 is authoritative for uploaded parts and completed objects. D1 stores server-side transfer identity and lifecycle. IndexedDB stores browser recovery metadata. Uppy owns active browser transport; Solid displays it. Neither runtime state nor UI state is durable truth.

Persist transfer ID, object key, multipart upload ID, file name and size, meaningful modification time, fingerprint and algorithm version, part-size policy, lifecycle state and timestamps. Store a file handle where supported. Version persisted data and preserve the ability to recover deployed in-progress transfers across updates.

Checkpoint identities before relying on them. Use small atomic writes. Keep remote object and upload identity stable across retries. A crash after a remote success must be recoverable even if the response or next local write was lost.

UI disposal, fiber interruption, tab closure, renderer loss and network loss must never implicitly abort a remote upload. Pause and destructive cancellation are different domain actions.

## Recovery

Recover in this order:

1. Load durable transfer identity and reauthorize access.
2. Restore local file access. Check handle permissions and request permission through a user gesture when needed. Otherwise ask the user to select the expected file again.
3. Verify the source file before sending another byte.
4. Reconcile with R2 ListParts, including pagination. Local completed-part records are only a cache.
5. Resume missing or failed work against the existing multipart upload.
6. If finalization may already have succeeded, inspect the completed object and reconcile domain state before retrying or creating anything.

File name alone is not identity. Check size, modification time where meaningful and a versioned content fingerprint. Reject changed or uncertain sources. A sampled fingerprint can detect accidental replacement without rereading the entire file, but is not proof of full byte integrity. Choose and document the algorithm before shipping recovery.

Expired signed URLs require fresh authorization for the affected operation. A network outage pauses work and resumes when safe. Retry transient failures with bounded attempts and backoff; do not restart successful parts. Permission loss requires user attention. A missing or expired remote upload needs an explicit explanation and recovery decision, not a silent restart.

Browser capabilities vary. Persistent handles may allow restoration; other browsers require reselection. State that limitation in the UI. Golden Retriever can help restore files, but durable transfer identity must exist independently.

## Multipart and resource limits

- Derive part size from file size and the provider's current minimum, maximum and part-count limits. Persist the chosen policy. Benchmark before choosing defaults.
- Sign parts lazily. Thousands of URLs signed at the start can expire before use.
- Send file bytes directly between client and R2. RPC coordinates access and lifecycle.
- Bound memory by concurrency and part size, not total file size. Respect backpressure and release local resources.
- Uppy owns scheduling, progress events and transport retries. Do not build a competing transport state machine or wrap its events in a second framework.
- Use explicit domain states for recovery, file access, finalization and cancellation. Avoid independent booleans that admit contradictory states.

## Completion, cancellation and expiry

Completion is idempotent. If the object completes but its response is lost, recovery must converge on the same completed transfer.

Before marking complete, confirm object existence, expected size, matching transfer identity, finalized upload state, accounting and recipient availability. Use stronger checksums where the integrity claim requires them. Multipart ETags and sampled source fingerprints do not establish whole-file equality.

Keep recovery metadata until completion is known. Report finalization separately from uploaded bytes reaching 100%.

Authorize cancellation, stop local work, abort remote multipart state and reconcile capacity and durable metadata. Retrying cancellation must be safe. Expiry and confirmed abandonment can also trigger cleanup, but maintenance must respect the advertised resume window.

An upload change is incomplete until the recipient can obtain the correct file through an authorized link. Expiry must be clear. Define download recovery and avoid needlessly redownloading confirmed bytes where supported.

## Authorization and diagnostics

Every create, sign, list, complete, abort and download operation checks the caller's identity, ownership, relevant workspace membership, entitlement and transfer status. Bind the object key and multipart ID to the authorized transfer. A client-supplied upload ID must not grant arbitrary storage access.

Record transfer and multipart identities, recovery transitions, retries, file mismatches, authorization renewal and completion uncertainty. Never log credentials, session tokens, signed URLs or file contents.

Measure success and resume rates, avoidable bytes resent, manual intervention, retries and finalization failures. Distinguish database or storage outages from missing authorization.

## User-visible behavior

Progress reflects confirmed work. Show in-flight activity separately if needed. Smooth speed estimates and use approximate ETA. Explain the next action for offline, reselect-file, permission-required, expired-upload and retry states.

Recovery should preserve the user's understanding of what already arrived. Never silently claim an automatic capability the browser cannot provide.

## Verification and release gates

Inject failures and verify the final object, domain state and bytes resent. A reassuring progress bar is not evidence.

| Gate                | Required evidence                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Internal            | 10 GB with network loss, failed-part retry and refresh                                                                    |
| Serious beta        | 100 GB with tab close, sleep/wake, authorization expiry and recovery                                                      |
| Reliability promise | 350 GB with router restart, browser restart, reselection, remote reconciliation and completion verification               |
| Reboot promise      | 350 GB with machine reboot, durable restoration, same-file verification and continuation of the existing multipart upload |

Do not market a gate before it passes. Record environment, failure injected, final object verification, manual steps and avoidable retransmission in the PR or issue.

Exercise these cases before declaring browser recovery complete:

- Offline, flapping or changed networks; timeout, throttling and server failures.
- Expired authorization during upload; permission loss; refresh, tab close, browser restart and sleep/wake.
- Same-file reselection, changed content with matching name/size, and missing source files.
- Stale local metadata, missing remote parts, paginated part listings and expired multipart state.
- Duplicate completion, successful completion with lost response, and interruption during finalization.
- Explicit cancellation and expiry cleanup racing with active work.

Prioritize silent corruption, access-control bypass and wrong-user recovery above all else. Next come avoidable full restarts, inaccessible completed files and divergent remote/domain state. Progress and copy defects still need fixes, but cannot displace correctness work.

New test files require explicit user approval under [AGENTS.md](../AGENTS.md). Use existing tests and direct runtime checks otherwise.

## Future desktop contract

The renderer presents a snapshot; a separate background process owns file access, transport and SQLite recovery metadata. Renderer disappearance must not determine upload correctness.

Before claiming desktop recovery, verify background and tray operation, daemon restart, machine reboot, sleep/wake, network changes, external-drive loss, source changes, updater interruption and bounded resource use. Reconcile with R2 after restart just as in the browser.

For receiving, add disk-space checks, destination rules, resume and integrity verification before automatic remote cleanup. Implement these when desktop work begins, not as prerequisites for web delivery.

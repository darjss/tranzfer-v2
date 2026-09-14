# RELIABILITY.md

# Tranzfer Reliability Contract

> **A transfer is not fragile.**
>
> Once Tranzfer has successfully moved bytes, ordinary failure should not make the user move those bytes again.
>
> If Tranzfer has already moved 220 GB of a 350 GB project, the default outcome after failure is:
>
> **continue from roughly 220 GB.**
>
> Not:
>
> **start from zero.**

This document is the reliability contract for Tranzfer.

`SOUL.md` explains what kind of product Tranzfer is.

`STACK.md` explains which tools we use.

This file explains what **must remain true when everything goes wrong**.

Any code touching uploads, downloads, transfer persistence, multipart state, recovery, verification, cleanup, or resumability must preserve the invariants in this document.

Reliability is not a later hardening phase.

Reliability is the product.

---

# 1. The promise

Tranzfer exists to move enormous files between people without making them babysit transport.

The user is allowed to have an unreliable environment.

Their Wi-Fi can disappear. Their ISP can flap. Their router can reboot. Their laptop can sleep. Their browser can refresh. Their tab can close. Their browser can restart. Their machine can reboot. A signed URL can expire. A multipart part can fail. An API can briefly return an error. A renderer can crash. The UI can disappear. A transfer can be 63% complete when any of this happens.

Tranzfer is responsible for making ordinary failure boring.

The product should behave as though the transfer is a durable job that happens to be observed by a UI.

The UI is not the job.

The browser tab is not the job.

The Electron window is not the job.

The current JavaScript process is not the job.

**The transfer is the job.**

---

# 2. The prime directive

> **Never make the user upload bytes again if Tranzfer can prove those bytes already exist correctly on the remote side.**

This does not mean blindly trusting stale local state.

It means:

1. persist enough identity to recover the transfer;
2. ask the remote system what actually exists;
3. verify the local file is still the same file;
4. reconcile the two;
5. continue only the missing work.

If correctness and convenience conflict, correctness wins.

A resume that silently corrupts a file is worse than a restart.

---

# 3. Hierarchy of truth

For browser uploads:

```text
Cloudflare R2 multipart state
        ↑
        │ remote truth
        │
IndexedDB durable session metadata
        ↑
        │ local durable recovery state
        │
Uppy runtime
        ↑
        │ current process/session
        │
Solid 2 UI
```

For future desktop uploads:

```text
Cloudflare R2 multipart state
        ↑
SQLite durable transfer state
        ↑
Background transfer engine
        ↑
Electron + Solid UI
```

The closer a layer is to the actual bytes, the more authoritative it is.

The UI must never become durable truth.

A signal, store, memo, query cache, or renderer state must never be the only place where critical recovery information exists.

---

# 4. Reliability invariants

These are product invariants, not implementation suggestions.

## 4.1 Remote completed parts are authoritative

If R2 reports that part 842 exists for the current multipart upload, that is stronger evidence than a stale local progress bar claiming only 841 parts completed.

Local progress can be wrong.

Remote multipart state is the source of truth for uploaded parts.

## 4.2 Durable metadata must be sufficient to recover

An in-progress transfer must persist enough information to reconstruct its identity after process loss.

Conceptually:

```ts
type DurableUploadSession = {
  transferId: string;
  objectKey: string;
  multipartUploadId: string;

  fileName: string;
  fileSize: number;
  lastModified: number | null;
  fingerprint: string;

  chunkSize: number;

  createdAt: number;
  updatedAt: number;

  status: "preparing" | "uploading" | "paused" | "recovering" | "finalizing";
};
```

The shape may evolve.

The invariant does not.

## 4.3 Never resume against an unverified local file

If the user replaces `Episode42.mov` after 180 GB has already uploaded, Tranzfer must not blindly combine the old first 180 GB with the new remainder.

Before resuming after restoration, verify the local file using multiple signals:

```text
name
size
last modified time where meaningful
stable fingerprint
```

Do not resume when identity is uncertain.

## 4.4 Filename is not identity

Two files can share a name, extension, or size.

Identity must be stronger than any one of those.

## 4.5 Retry only failed work

A failed part must not cause successful parts to be uploaded again.

A temporary signing failure must not reset the multipart upload.

A temporary API failure must not destroy the transfer.

## 4.6 Expired authorization is recoverable

Expired signed URLs or temporary credentials are expected.

The behavior should be:

```text
authorization expires
        ↓
obtain fresh authorization
        ↓
retry the affected operation
```

Not:

```text
authorization expires
        ↓
restart 300 GB file
```

## 4.7 Network disappearance is a pause

A lost connection is ordinary behavior.

The product should say:

> Connection lost. Waiting to continue.

When connectivity returns, continue automatically wherever safe.

## 4.8 Completion is idempotent

This must be safe:

```text
all parts uploaded
       ↓
CompleteMultipartUpload sent
       ↓
remote object completes
       ↓
client crashes before response arrives
       ↓
client restarts
```

Recovery must converge toward the same correct completed state.

## 4.9 Abort is explicit

Do not silently abort a valid multipart upload because:

```text
tab closed
window closed
renderer crashed
network disappeared
```

Those are not cancellation.

Cancellation is a deliberate product action.

## 4.10 Recovery reconciles; it does not assume

Compare durable local state with remote multipart state.

Remote state wins disagreements about uploaded parts.

## 4.11 Transfers outlive processes

Browser runtime dies: transfer survives.

Renderer dies: transfer survives.

Desktop UI closes: transfer survives.

Machine reboots: transfer survives if the platform can reconnect to the same local file.

## 4.12 Progress reflects real work

Do not fake progress.

Do not report complete merely because the last part upload finished.

A transfer is complete only after remote completion and Tranzfer state safely reconcile.

## 4.13 Reliability degrades honestly

If automatic file access cannot be restored, ask the user to reselect the original file and continue.

Never pretend a guarantee exists when the platform cannot provide it.

---

# 5. What “resume” means

Do not use the word loosely.

## Level 0 — retry

A single request failed. Retry it.

## Level 1 — network resume

Connectivity disappears while the runtime remains alive. Continue when it returns.

## Level 2 — runtime resume

Refresh or renderer reload. Reconstruct and continue.

## Level 3 — browser-session resume

Browser/tab closes. Restore durable session metadata and recover file access where possible.

## Level 4 — machine-reboot resume

The OS restarts.

On web:

```text
restore durable session
        ↓
restore persistent file handle if possible
        ↓
otherwise reselect same file
        ↓
verify identity
        ↓
ListParts
        ↓
resume missing work
```

On desktop:

```text
restore local path
verify file
reconcile remote parts
continue
```

## Level 5 — unattended desktop resume

Future target:

```text
machine reboots
        ↓
background agent starts
        ↓
unfinished transfer found
        ↓
file still matches
        ↓
remote multipart state reconciled
        ↓
transfer continues without opening the UI
```

Do not promise a level before we have actually tortured it.

---

# 6. Browser reliability contract

Browser uploads live under browser security constraints.

Do not pretend otherwise.

## 6.1 Durable browser state

Persist unfinished transfer metadata in IndexedDB or equivalent durable browser storage.

Persist:

```text
transfer identity
multipart upload identity
remote object key
file identity metadata
fingerprint
chunk policy
recovery status
timestamps
file-system handle when supported
schema version
```

Solid signals are not persistence.

Uppy runtime state is not persistence.

Local variables are not persistence.

## 6.2 Persistent file handles

Where supported, store a file-system handle durably.

On restoration:

```text
restore handle
       ↓
check permission
       ↓
request permission through user gesture if required
       ↓
obtain File
       ↓
verify identity
       ↓
reconcile multipart state
       ↓
resume
```

A permission prompt is not a transfer failure.

## 6.3 Reselect fallback

If file access cannot be restored:

```text
unfinished transfer detected
       ↓
show expected file
       ↓
user selects local file
       ↓
verify identity
       ↓
resume existing multipart upload
```

The user should not restart merely because browser file access was lost.

## 6.4 Golden Retriever

Uppy Golden Retriever may be used as an extra recovery layer for:

```text
selected file recovery
runtime state restoration
accidental refresh
tab closure
```

It is not the entire durability design.

Our own durable transfer identity must exist independently.

## 6.5 Capability tiers

Internally classify browser recovery capability.

Example:

```text
Tier A
persistent file handle available
strongest automatic recovery

Tier B
durable session available
file must be reselected

Tier C
limited browser APIs
best-effort recovery with explicit limitations
```

Never silently downgrade.

---

# 7. Desktop reliability contract

The desktop app exists partly because native processes can provide stronger long-running guarantees.

## 7.1 Electron is the shell

Assume Electron unless product reality changes it.

Electron owns:

```text
window lifecycle
tray
menus
native notifications
updater
OS integration
IPC bridge
```

Electron does not own the transfer engine.

## 7.2 Background transfer engine

Initial assumption:

```text
compiled Bun sidecar process
```

Responsibilities:

```text
filesystem reads
multipart upload
durable queue
SQLite
retries/backoff
network recovery
bandwidth policy
sleep/wake recovery
remote reconciliation
finalization
```

The renderer may disappear without affecting upload correctness.

## 7.3 Renderer independence

Ideal:

```text
user closes Tranzfer window
       ↓
renderer dies
       ↓
minimal Electron shell remains
       ↓
Bun uploader keeps transferring
```

When the UI returns:

```text
renderer starts
       ↓
requests current snapshot
       ↓
projects daemon state
```

## 7.4 Desktop durable database

Conceptually:

```sql
uploads
-------
id
transfer_id
local_path
file_name
file_size
last_modified
fingerprint
remote_key
multipart_upload_id
chunk_size
status
created_at
updated_at
```

and optionally:

```sql
parts
-----
upload_id
part_number
etag
size
completed_at
```

Exact schema may change.

The recovery capability may not.

## 7.5 Remote truth still wins

SQLite accelerates recovery.

R2 confirms reality.

## 7.6 Bun is not sacred

If profiling shows unacceptable RAM, CPU, battery use, missing OS behavior, or reliability problems, replace only the daemon boundary.

A future Rust daemon must not require rewriting the renderer, API, contracts, or transfer UX.

---

# 8. Multipart design

Multipart is the basis of giant-file resumability.

## 8.1 Huge files use multipart

Do not upload 300 GB as one enormous request.

## 8.2 Chunk size is derived

Never hardcode a chunk size that can exceed the provider's multipart part-count limit.

A reasonable starting policy may be approximately:

```text
large files          ~64 MiB
hundreds of GB       ~128 MiB
very large files     ~256 MiB
```

Benchmark before canonizing values.

## 8.3 Trade-off

Smaller parts:

```text
+ less retransmission on failure
+ finer resume granularity
- more requests
- more signing operations
- more bookkeeping
```

Larger parts:

```text
+ fewer requests
+ less control-plane chatter
- more retransmission per failed part
- coarser recovery
```

## 8.4 No presigning the whole future

Do not generate thousands of part URLs at transfer start.

Long-running transfers can outlive them.

Sign lazily or use another safe short-lived credential strategy.

## 8.5 Stable object identity

Once multipart creation fixes the remote object identity, resumed operations must continue against that same object.

## 8.6 `ListParts` is core infrastructure

Use it after uncertain interruption.

Use it when local and remote state may disagree.

Use it before deciding what to resend.

---

# 9. File identity and fingerprinting

Resuming the wrong file is corruption.

Treat file identity as a first-class domain concept.

Persist:

```text
name
size
lastModified when available
fingerprint
fingerprint algorithm version
```

The fingerprint should detect accidental replacement without requiring a complete 350 GB reread before every resume.

A possible sampled strategy:

```text
hash(
  metadata
  +
  beginning sample
  +
  deterministic interior samples
  +
  end sample
)
```

The exact algorithm may evolve.

A full checksum may be computed incrementally while bytes are already being read.

Do not repeatedly re-hash giant files without reason.

---

# 10. State machines, not boolean soup

Do not model upload lifecycle as unrelated booleans that can contradict one another.

Prefer explicit tagged states.

Example:

```ts
type TransferState =
  | { tag: "preparing" }
  | { tag: "waiting-for-file-access" }
  | { tag: "verifying-local-file" }
  | { tag: "creating-multipart" }
  | { tag: "uploading"; progress: Progress }
  | { tag: "offline"; progress: Progress }
  | { tag: "paused"; progress: Progress }
  | { tag: "retrying"; attempt: number; progress: Progress }
  | { tag: "recovering" }
  | { tag: "reconciling-parts" }
  | { tag: "finalizing" }
  | { tag: "verifying-remote-object" }
  | { tag: "complete"; transferId: string }
  | { tag: "cancelled" }
  | { tag: "failed"; error: TransferError };
```

Use Effect `Match` / tagged enums where exhaustive matching improves clarity.

---

# 11. Recovery state machine

Recovery is not one boolean.

Conceptually:

```text
load durable session
       ↓
does transfer still exist?
       ↓
can local file be opened?
       ↓
does local file still match?
       ↓
does multipart upload still exist?
       ↓
ListParts
       ↓
reconcile
       ↓
resume
```

Possible states:

```ts
type RecoveryState =
  | { tag: "loading-session" }
  | { tag: "needs-permission" }
  | { tag: "needs-file-reselection" }
  | { tag: "verifying-file" }
  | { tag: "remote-upload-expired" }
  | { tag: "reconciling-parts" }
  | { tag: "ready-to-resume" }
  | { tag: "resuming" }
  | { tag: "file-changed" }
  | { tag: "already-complete" }
  | { tag: "failed"; error: RecoveryError };
```

Solid projects these states.

Solid does not invent them independently.

---

# 12. Failure taxonomy

Not all failures are equal.

## Retryable transport failure

Examples:

```text
temporary network loss
timeout
429
5xx
temporary storage issue
```

Behavior:

```text
retry with bounded backoff
preserve session
do not restart whole file
```

## Authorization expiry

Behavior:

```text
refresh authorization
retry operation
```

## User attention required

Examples:

```text
file permission lost
file handle unavailable
local path moved
external drive disconnected
```

Behavior:

```text
pause safely
preserve remote progress
ask for the smallest possible user action
```

## Local file mismatch

Behavior:

```text
do not resume
explain why
offer safe restart
```

## Remote multipart expired

Behavior:

```text
do not pretend resume remains possible
explain clearly
start fresh only through explicit product logic
```

## Finalization uncertainty

Behavior:

```text
inspect remote object
reconcile transfer status
converge idempotently
```

## Fatal invariant failure

Behavior:

```text
capture diagnostics
fail loudly
do not continue with questionable data
```

---

# 13. Progress, speed, and ETA

The progress bar is part of trust.

Progress must represent confirmed work.

Speed should be smoothed enough to be useful.

ETA should be honest, not absurdly precise.

Prefer:

```text
~18 min remaining
```

over:

```text
17m 42.381s
```

If bytes are done but finalization is not:

```text
Uploading 100%
Finalizing...
```

Do not call the transfer complete early.

---

# 14. Persistence rules

Persist valuable identity before proceeding into work that would be difficult to rediscover.

If multipart upload creation succeeds, do not rely on volatile memory as the only place that knows its identity.

Prefer small, atomic durable checkpoints.

Persist domain recovery state, not giant runtime blobs.

Version persisted schemas:

```ts
{
  schemaVersion: 1,
  ...
}
```

A user may begin a transfer on frontend version N and resume on version N+1.

Do not casually make deployed in-progress transfers unreadable.

---

# 15. Cleanup

Incomplete multipart uploads consume remote resources.

Stale sessions must eventually be aborted.

But cleanup must respect the advertised resume window.

Never promise:

> Resume within 7 days

while maintenance aborts the session after 24 hours.

Product semantics and lifecycle policy must agree.

Closing the UI is not cleanup.

Losing the network is not cleanup.

Explicit cancellation, expiry, and confirmed abandonment are cleanup events.

---

# 16. Cancellation

Cancel is destructive.

A true cancellation may:

```text
stop active work
abort multipart upload
free transfer capacity
remove durable recovery metadata
mark transfer cancelled
```

Do not trigger this sequence because a renderer disappears.

---

# 17. Security during resume

Resume is not an authorization bypass.

The API must still verify:

```text
identity
transfer ownership
workspace membership
entitlement
transfer status
object-key ownership
multipart-upload association
```

A client must never be able to present an arbitrary `uploadId` and receive signed access to arbitrary storage objects.

---

# 18. Integrity after completion

Completion is more than one successful API response.

At minimum reconcile:

```text
object exists
expected size
transfer record matches object
upload session is complete
capacity/accounting is correct
recipient availability is correct
```

Where stronger checksums are useful and affordable, add them.

---

# 19. Download reliability

Uploads come first, but the philosophy applies in reverse.

A future desktop receiver should support:

```text
background download
resume
bandwidth limits
destination rules
disk-space checks
checksum verification
post-download remote cleanup
```

The invariant remains:

> already downloaded bytes should not be needlessly downloaded again.

---

# 20. Resource safety

Do not buffer giant files in memory.

Memory usage should scale with:

```text
concurrency × bounded part size
```

not:

```text
total file size
```

Respect backpressure.

Do not leak file descriptors over multi-hour transfers.

Do not repeatedly reread or rehash hundreds of gigabytes without a clear reason.

---

# 21. Sleep, wake, and network changes

Sleep is normal laptop behavior.

On wake:

```text
check connectivity
refresh authorization if needed
reconcile uncertain work
continue
```

Network transitions are normal too:

```text
Ethernet → Wi‑Fi
Wi‑Fi → hotspot
VPN on/off
home → office
```

Temporary transition may pause throughput.

It should not require restarting the transfer.

---

# 22. Uppy responsibilities

Uppy owns browser upload mechanics.

That includes the mechanics around:

```text
multipart orchestration
part uploads
retry/backoff
pause/resume
progress
remote part listing
completion
abort
```

Tranzfer owns:

```text
transfer identity
quota
durable session identity
same-file verification
recovery UX
authorization
business lifecycle
telemetry
final verification
abuse controls
acceptance testing
```

Do not reimplement Uppy for sport.

Do not assume Uppy automatically solves every product-level recovery requirement.

---

# 23. Solid 2 responsibilities

Solid owns reactive presentation and orchestration.

Solid does not own durable correctness.

Good:

```text
durable recovery service
        ↓
reactive state
        ↓
Solid UI
```

Bad:

```text
Solid signal
        ↓
effect
        ↓
hope it persisted
```

Derive whenever possible.

Effects are for external side effects, not synchronizing multiple copies of the same domain state.

Component destruction must always be safe.

---

# 24. Desktop renderer responsibilities

The desktop renderer may:

```text
display progress
display speed
display ETA
display errors
request pause
request resume
request cancellation
show recovery prompts
```

It must not be the only owner of:

```text
local file path
multipart uploadId
durable queue
retry policy
remote reconciliation
```

---

# 25. Background daemon responsibilities

The background transfer engine must be reconstructible from:

```text
local durable database
+
local filesystem
+
remote storage state
+
Tranzfer API
```

It must not require the renderer to explain what it was doing before a crash.

---

# 26. Observability

Record meaningful events such as:

```text
transfer_created
multipart_created
part_retry
network_offline
network_restored
auth_refreshed
tab_recovery_started
file_permission_required
file_reselected
file_identity_mismatch
parts_reconciled
resume_started
resume_succeeded
resume_failed
finalization_started
finalization_retried
transfer_completed
transfer_cancelled
multipart_expired
```

Never log raw credentials, signed URLs, private tokens, or file contents.

---

# 27. Reliability metrics

Eventually measure:

```text
successful transfer rate
successful resume rate
manual-intervention rate
avoidable bytes re-uploaded
average retries per large transfer
finalization failure rate
reselection frequency
file mismatch frequency
multipart expiry frequency
time from recovery to resumed throughput
```

A particularly important metric is:

> **avoidable re-uploaded bytes**

If a user successfully moved 217 GB and Tranzfer unnecessarily makes them resend 217 GB, that is a serious product failure.

---

# 28. Recovery UX

Recovery should feel calm.

Example:

```text
Episode 42
347 GB

Found unfinished transfer
217 GB already uploaded

[Continue]
```

If permission is required:

```text
217 GB is already uploaded.

Allow access to the original file to continue.

[Allow & continue]
```

If reselection is required:

```text
Select the original Episode42.mov to continue.
Already uploaded data will not be sent again.

[Choose file]
```

If the file changed:

```text
This file no longer matches the upload that started earlier.

To protect your footage, Tranzfer won't combine two different file versions.

[Start a new transfer]
```

Do not expose `ListMultipartUploadParts`, SigV4, IndexedDB, ETags, or other infrastructure jargon to users.

---

# 29. No fake heroics

If we cannot prove the local file is the same file: stop.

If the remote multipart session no longer exists: say so.

If storage returns a state we do not understand: fail safely.

Reliability means trustworthy continuation, not aggressive continuation at all costs.

---

# 30. Torture testing is product development

Mocked tests are necessary.

They are not sufficient.

The product's value is surviving real failure, so we must create real failure.

Required baseline file sizes:

```text
10 GB
100 GB
350 GB
```

Later add 500 GB and 1 TB when real usage and plan limits justify it.

---

# 31. Browser torture matrix

For a serious 350 GB test:

## Connectivity

- [ ] disconnect Wi‑Fi mid-part
- [ ] reconnect after 30 seconds
- [ ] reconnect after 10 minutes
- [ ] switch networks mid-transfer
- [ ] restart router
- [ ] temporary DNS failure
- [ ] connection becomes dramatically slower

## Request failures

- [ ] force a part to return 429
- [ ] force a part to return 500
- [ ] force several consecutive retryable failures
- [ ] signing endpoint 500
- [ ] signing endpoint timeout
- [ ] signed authorization expiry
- [ ] failure immediately before finalization
- [ ] lost response immediately after finalization

## Browser lifecycle

- [ ] refresh at 1%
- [ ] refresh at 40%
- [ ] refresh at 99%
- [ ] close tab at 30%
- [ ] close tab at 70%
- [ ] reopen site
- [ ] close browser
- [ ] reopen browser
- [ ] browser crash if reproducible
- [ ] PC reboot
- [ ] sleep laptop
- [ ] wake laptop

## File access

- [ ] persistent file handle remains valid
- [ ] permission must be requested again
- [ ] handle unavailable
- [ ] reselect original file
- [ ] reselect wrong file
- [ ] reselect same-name different file
- [ ] original file moved
- [ ] original file deleted
- [ ] original file modified

## Remote reconciliation

- [ ] local state misses a completed remote part
- [ ] local state claims completion but remote does not
- [ ] stale local progress
- [ ] multipart session expired
- [ ] final object already completed
- [ ] cleanup races with recovery

## Completion

- [ ] crash before completion request
- [ ] crash during completion request
- [ ] remote completes but response is lost
- [ ] recovery sees already-completed object
- [ ] duplicate finalization attempt
- [ ] final object size verification

---

# 32. Desktop torture matrix

When desktop exists:

- [ ] close renderer while upload continues
- [ ] destroy BrowserWindow entirely
- [ ] Electron shell restart
- [ ] Bun daemon restart
- [ ] kill daemon mid-part
- [ ] OS reboot
- [ ] auto-start after reboot
- [ ] local file path still valid
- [ ] local file moved
- [ ] local file changed
- [ ] external drive unplugged
- [ ] external drive reconnected
- [ ] machine sleep/wake
- [ ] network switch
- [ ] tray-only operation for hours
- [ ] update lifecycle does not destroy active transfers
- [ ] renderer and daemon can reconnect after update
- [ ] incoming download checks free disk space

---

# 33. Acceptance standard

A torture test does not pass because the UI looks okay.

It passes only if:

```text
final remote object is correct
+
already uploaded valid parts were not needlessly resent
+
transfer state converged correctly
+
the user could understand what happened
```

---

# 34. Release gates

## Gate A — internal

```text
10 GB
network drop
part retry
refresh
```

## Gate B — serious beta

```text
100 GB
tab close
sleep/wake
authorization expiry
recovery
```

## Gate C — Tranzfer reliability promise

```text
350 GB
router restart
browser restart
file reselection recovery
remote reconciliation
completion verification
```

## Gate D — reboot promise

```text
350 GB
machine reboot
durable restore
same-file verification
continue existing multipart upload
```

Do not market Gate D before Gate D passes.

---

# 35. Regression severity

## P0

```text
silent file corruption
security boundary bypass
wrong user's object resumed
```

## P1

```text
recoverable huge upload restarts from zero
completed transfer becomes inaccessible
remote object and product state diverge badly
```

## P2

```text
manual action required where automatic recovery should work
progress incorrect after recovery
resume requires unnecessary extra steps
```

## P3

```text
confusing recovery copy
weird ETA
cosmetic state issue
```

---

# 36. Agent rules

Every coding agent touching transfer code must know:

```text
R2 remote state is authoritative for uploaded parts.
Durable metadata outlives UI processes.
Local file identity must be verified.
Recovery reconciles; it does not assume.
Component lifetime must not determine correctness.
Uppy owns browser upload mechanics.
Solid owns presentation, not durable transfer truth.
```

Reject code that:

- stores critical upload identity only in a component;
- creates a second upload state machine next to Uppy;
- aborts uploads on page/window disappearance;
- assumes unload means cancellation;
- clears durable state before completion is known;
- resumes based only on filename;
- trusts stale local completed-part lists without reconciliation;
- treats every error as fatal;
- restarts a whole file after one failed part;
- pre-signs thousands of future part URLs;
- hardcodes chunk size without part-limit reasoning;
- marks complete before finalization;
- swallows completion uncertainty;
- logs signed URLs or credentials.

---

# 37. Code-review questions

Every upload/recovery PR should answer:

1. What durable state does this change create?
2. What happens if the process dies immediately afterward?
3. What if the remote operation succeeded but the response is lost?
4. What if local and remote state disagree?
5. What if the local file changed?
6. Can the user be forced to resend already-confirmed bytes?
7. Does cancellation remain explicit?
8. Can this survive refresh?
9. Can this survive browser restart?
10. Can this survive machine reboot?
11. Does it preserve future desktop compatibility?
12. What torture test proves it?

---

# 38. Definition of done: browser uploader

The browser uploader is not done because a 1 GB happy path reaches R2.

It is done when:

- [ ] 10 GB works
- [ ] 100 GB works
- [ ] 350 GB works
- [ ] chunk policy respects multipart limits
- [ ] progress is accurate
- [ ] retryable errors retry
- [ ] network loss recovers
- [ ] refresh recovers
- [ ] tab close recovers
- [ ] browser restart has a recovery path
- [ ] PC reboot has a recovery path
- [ ] file permission loss has a recovery path
- [ ] original file reselection safely resumes
- [ ] changed file is rejected
- [ ] remote parts reconcile
- [ ] authorization can refresh
- [ ] finalization is safe
- [ ] final object is verified
- [ ] cancellation cleans up intentionally
- [ ] stale sessions eventually clean up

---

# 39. Definition of done: desktop uploader

Desktop upload is not done because Electron can upload a file.

It is done when:

- [ ] renderer may disappear without stopping upload
- [ ] daemon state survives daemon restart
- [ ] machine reboot resumes
- [ ] local file is verified
- [ ] changed file is rejected
- [ ] remote state reconciles
- [ ] tray-only transfer works for hours
- [ ] sleep/wake works
- [ ] network switch works
- [ ] external-drive loss is handled safely
- [ ] update lifecycle does not destroy active transfers
- [ ] resource usage is acceptable

---

# 40. What we explicitly do not build yet

Reliability is not permission to build a storage operating system.

Do not build yet:

```text
mounted filesystem
Dropbox-style sync
folder mirroring
distributed block deduplication
peer-to-peer transport
custom TCP protocol
custom congestion control
global accelerator network
bespoke multipart protocol
enterprise transfer appliance
```

Use existing infrastructure.

S3-compatible multipart already solves the core remote resumability primitive.

Uppy already solves much of browser transfer mechanics.

R2 already stores the parts.

We build the product semantics and recovery experience around those primitives.

---

# 41. Anti-overengineering rule

When deciding between:

```text
beautiful generic transfer abstraction
```

and:

```text
350 GB upload survives router restart
```

choose the second one.

When deciding between:

```text
five-backend portable storage adapter
```

and:

```text
R2 resume works after browser restart
```

choose the second one.

When deciding between:

```text
perfect event-sourced upload architecture
```

and:

```text
real editor resumes a failed upload
```

choose the second one.

---

# 42. Anti-underengineering rule

“Don't overengineer” is not permission to ship fragile uploads.

These are not optional polish:

```text
multipart
retry
durable upload identity
reconciliation
same-file verification
safe finalization
real torture testing
```

For Tranzfer, these are the minimum product.

---

# 43. The 350 GB rule

Every upload architecture proposal must explain this scenario:

```text
A creator has a 350 GB project.

They start uploading at night.

At 63%:
the router restarts.

Ten minutes later:
the network returns.

At 71%:
the laptop sleeps.

In the morning:
the laptop wakes.

At 79%:
the browser is accidentally closed.

Later:
the computer reboots for an update.

The creator opens Tranzfer again.

Tranzfer finds the unfinished transfer.

It restores or requests access to the original file.

It verifies the file is unchanged.

It asks R2 which parts already exist.

It continues from the missing work.

The creator does not resend 276 GB.

The editor eventually receives one correct file.
```

If a design cannot explain exactly how this works, the design is incomplete.

---

# 44. The already-moved-bytes rule

> **Already moved bytes are an asset. Preserve them.**

Every retry strategy, persistence decision, cleanup policy, and UX flow should respect that.

---

# 45. The one-file rule

A multipart object must correspond to one immutable logical source-file version.

Do not combine versions.

Do not guess.

One logical transfer.

One logical source file.

One final object.

---

# 46. The remote-truth rule

When recovering:

```text
local says 72%
remote says 74%
```

remote wins.

When:

```text
local says part 1200 done
remote does not have part 1200
```

upload part 1200 again.

When:

```text
local says finalizing
remote object already exists correctly
```

converge toward complete.

---

# 47. The calm-software rule

Failures should not make the product scream.

Prefer:

```text
Connection lost.
We'll continue when you're back online.
```

or:

```text
We need access to the original file to continue.
217 GB is already uploaded.
```

The product should communicate confidence because the system actually has a recovery plan.

---

# 48. Reliability ladder

```text
happy-path upload
        ↓
part retry
        ↓
network recovery
        ↓
refresh recovery
        ↓
tab/browser recovery
        ↓
machine-reboot recovery
        ↓
background desktop transfer
        ↓
unattended recurring delivery
```

Do not skip lower rungs.

---

# 49. Reliability before automation

Automation amplifies whatever reliability exists underneath.

If transfer is fragile:

```text
automation = automated failure
```

Therefore:

```text
reliable transfer
        ↓
background transfer
        ↓
trusted relationships
        ↓
automatic delivery
```

---

# 50. Reliability before everything else

Review features are irrelevant if the file never arrives.

Pricing sophistication is irrelevant if a 300 GB transfer restarts from zero.

Desktop architecture is irrelevant if browser reliability has not taught us the actual failure modes.

Scale is irrelevant before ten users trust us with real footage.

Reliability comes first.

---

# 51. Product copy constraints

Do not claim:

> Never fails.

Nothing never fails.

Claim things we can prove.

Examples:

```text
Resumes interrupted transfers.

Already uploaded parts stay uploaded.

Lose Wi‑Fi. Pick up where you left off.

Reopen Tranzfer and continue.

No starting a 300 GB project from zero because your connection blinked.
```

Only market stronger claims after the corresponding release gate passes.

---

# 52. The customer's mental model

The customer should think:

> **Tranzfer remembers.**

Not:

> I hope the tab stays open.

---

# 53. The engineering mental model

Engineers and agents should think:

> **A transfer is a durable distributed job with a local source file and remote multipart state.**

Not:

> A transfer is a component with a progress bar.

---

# 54. The founder mental model

Do not turn reliability into another way to avoid customers.

The purpose of this document is to make Tranzfer trustworthy enough for real people to use.

It is not permission to spend three months perfecting theoretical failure modes nobody has encountered.

The sequence remains:

```text
build
break
fix
real human
repeat
ask for money
```

---

# 55. Final standard

Tranzfer should eventually be the software someone chooses when the file is too important and too large to casually try again.

The connection may fail.

The browser may disappear.

The process may die.

The machine may reboot.

The transfer should remain understandable, recoverable, and safe.

The best reliability feature is not a clever retry algorithm.

It is the user's belief, earned by repeated evidence, that:

> **I can leave this alone. Tranzfer will get it there.**

Until that is true:

**make the next transfer more reliable than the last one.**

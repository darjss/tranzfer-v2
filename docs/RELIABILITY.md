# Reliability

This is the most important file in the repository. Read all of it before you touch uploads, recovery, downloads, cancellation, expiry or anything that stores transfer state. Then read it again.

Everything here is an acceptance rule. None of it is a claim that the product already passes. If you write copy that says Tranzfer does something from this file, the matching gate below had better be green.

## The promise

Tranzfer moves enormous files between people without making anyone babysit the connection.

The user is allowed to live in an unreliable world. Their Wi-Fi drops. Their ISP flaps. Their router reboots. The laptop sleeps with the lid half open. The browser refreshes, the tab closes, the browser restarts, the machine reboots for an update nobody asked for. A signed URL expires. One part out of 7,000 fails. The API returns a 503 for four seconds. And all of this happens at 63%, because it always happens at 63%.

Tranzfer's job is to make all of that boring.

Say it out loud until it sticks:

The UI is not the job.

The browser tab is not the job.

The Electron window is not the job.

The JavaScript process is not the job.

**The transfer is the job.** It is a durable job with a local source file on one end and remote multipart state on the other. A UI happens to be watching it. When the UI dies, the job does not care.

## The prime directive

> Never make the user upload bytes again if Tranzfer can prove those bytes already exist correctly on the remote side.

Already moved bytes are an asset. They cost the user hours of their night. Every retry policy, persistence decision, cleanup job and screen of copy in this codebase has to respect them.

That does not mean trusting stale local state. It means:

1. Persist enough identity to recover the transfer.
2. Ask R2 what actually exists.
3. Prove the local file is still the same file.
4. Reconcile the two.
5. Send only the missing work.

When correctness and convenience disagree, correctness wins, every time. A resume that silently corrupts a file is far worse than a restart. A restart wastes a night. A corrupt file wastes a shoot.

## Hierarchy of truth

The closer a layer sits to the real bytes, the more it is believed.

```text
Browser today                       Desktop later

R2 multipart state                  R2 multipart state
      ^  remote truth                     ^
IndexedDB recovery metadata         SQLite transfer state
      ^  durable local memory             ^
Uppy runtime                        background transfer process
      ^  this session only                ^
Solid UI                            Electron + Solid UI
```

D1 sits beside R2 as the server's record of who owns which transfer and what lifecycle state it is in. R2 is authoritative for uploaded parts and completed objects. D1 is authoritative for identity, ownership and lifecycle.

A signal, store, memo, component or query cache is never the only place critical recovery information lives. If a refresh can erase it, it was never durable.

## The laws

These do not bend. A PR that breaks one of them is wrong even if every check is green.

1. **Remote completed parts are the truth.** Local completed-part lists are a cache. When local says part 1200 is done and R2 does not have it, upload part 1200 again. When local says 72% and R2 says 74%, R2 wins.
2. **Durable metadata is enough to recover.** If the process dies right after any line of transfer code, the next process can find the transfer and work out what to do.
3. **Never resume against an unverified file.** Verify the source before sending another byte.
4. **A filename is not an identity.** `Episode_14.mov` today and `Episode_14.mov` tomorrow can be different files.
5. **Retry only what failed.** One failed part never restarts the file.
6. **Expired authorization is recoverable.** Get fresh authorization for the operation and continue.
7. **Losing the network is a pause.** Not an error, not a cancel.
8. **Completion is idempotent.** Finishing twice, or finishing with a lost response, converges on the same completed transfer.
9. **Abort is explicit.** Only a deliberate user or policy action destroys remote multipart state.
10. **Recovery reconciles. It never assumes.**
11. **Transfers outlive processes.** Component disposal, fiber interruption, tab close, renderer loss and network loss never implicitly abort a remote upload.
12. **Progress reflects confirmed work.**
13. **Reliability degrades honestly.** When we cannot do something automatically, we say so plainly and tell the user the next step.

## What "resume" means

Nobody on this project uses the word loosely. Name the level.

| Level | Survives                  | What happens                                                                               |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------ |
| 0     | One failed request        | Retry that request with backoff                                                            |
| 1     | Network loss, same tab    | Pause, then continue when connectivity returns                                             |
| 2     | Refresh or renderer crash | Rebuild from durable metadata and continue                                                 |
| 3     | Tab or browser close      | Restore metadata, recover file access or ask for the file, reconcile, continue             |
| 4     | Machine reboot            | Same as 3 after the OS comes back. Web may need reselection. Desktop restores by path      |
| 5     | Nobody at the keyboard    | Desktop only. Background process finds the job, verifies the file and continues on its own |

Level 4 on the web looks like this:

```text
restore durable transfer
  -> restore file handle, or ask for the same file again
  -> verify identity
  -> ListParts
  -> upload missing parts
  -> finalize
```

Do not promise a level before we have tortured it. Do not skip lower rungs to build a higher one.

## What gets persisted

Persist, before relying on any of it:

- transfer ID, object key and multipart upload ID
- file name, size and a meaningful modification time
- content fingerprint and the fingerprint algorithm version
- part-size policy
- lifecycle state and timestamps
- a file handle, where the browser supports it

Write checkpoints small and atomic. Keep the object key and upload ID stable across every retry. Version persisted records, and make sure a deploy can still recover transfers that were in flight before it.

The nastiest window in this whole system is "remote succeeded, then we died." R2 accepted the part or completed the object, and the response never arrived or the next local write never happened. Every step has to be recoverable from that window. If you cannot explain how your change survives it, the change is not done.

## Recovery, in order

1. Load the durable transfer and reauthorize access.
2. Restore file access. Check handle permission and request it through a user gesture when needed. Otherwise ask the user to pick the same file again.
3. Verify the source file.
4. Call `ListParts` against R2 and follow its pagination to the end. A 350 GB upload has thousands of parts. Reading page one and calling it done is a bug.
5. Upload missing or failed parts into the existing multipart upload.
6. If finalization might already have happened, check for the completed object and reconcile D1 before retrying or creating anything.

No step is skipped because "it probably worked."

## File identity

Identity is size, modification time where it means something, and a versioned content fingerprint. All of them must match. Changed or uncertain means reject.

A sampled fingerprint catches accidental replacement without rereading 350 GB. It is not proof of full byte integrity, and nobody may describe it as such. Choose and document the algorithm before recovery ships, and store its version with every record so it can change later.

One multipart object corresponds to exactly one immutable source file version. Never mix versions. Never guess. One transfer, one source file, one final object.

## Browser reality

Browsers differ, and pretending otherwise is lying.

- Where persistent file handles work, restore the handle and ask for permission with a user gesture.
- Where they do not, ask the user to reselect the file. Tell them in the UI that this browser needs it, and tell them how much is already uploaded.
- Golden Retriever can help restore files, but durable transfer identity must exist without it.
- Never claim an automatic capability a browser does not have.

## Multipart and resources

R2 rules, from the current Cloudflare docs: at most 10,000 parts, 5 MiB to 5 GiB per part, and every part except the last must be the same size. By default R2 expires incomplete multipart uploads after 7 days. Check the docs again before changing any of this.

- Derive part size from file size and those limits, then persist the chosen policy with the transfer. A 350 GB file cannot fit in 10,000 parts below roughly 35 MB each. Uniform sizes mean the policy is fixed at creation and never changes mid-upload. Benchmark before picking defaults.
- Sign parts lazily. Thousands of URLs signed up front will expire before anyone uses them.
- File bytes travel directly between the client and R2. Workers and RPC never carry payloads. RPC coordinates access and lifecycle.
- Memory is bounded by concurrency times part size, never by file size. Respect backpressure and release what you hold.
- The advertised resume window must be shorter than whatever the bucket's lifecycle enforces. Promising a 14-day resume on a bucket that aborts uploads after 7 days is a lie with a delay.

## State machines, not boolean soup

Recovery, file access, finalization and cancellation are explicit domain states. `isUploading && isPaused && !isCancelled && hasError` is how contradictions get into production. If two booleans can both be true in a way that makes no sense, replace them with one state.

Uppy owns scheduling, progress events and transport retries. Do not build a second transport state machine next to it, and do not wrap its events in another framework. The domain states above sit over Uppy, not beside it.

## Failure taxonomy

Every failure falls into one of these. Each has exactly one correct response.

| Failure                | Examples                                         | Response                                                      |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Transient transport    | Timeout, 5xx, throttling, dropped connection     | Bounded retry with backoff for that request only              |
| Authorization expired  | Signed URL expired, session renewed              | Fresh authorization for the affected operation, then continue |
| Network gone           | Offline, sleep, changed networks                 | Pause. Resume when it is safe                                 |
| Needs the user         | File permission lost, file reselection required  | Stop and explain the one action needed                        |
| Local file mismatch    | Size, mtime or fingerprint changed               | Refuse to continue. Explain what changed                      |
| Remote upload gone     | `NoSuchUpload`, lifecycle expiry, aborted upload | Explain it and ask for a decision. Never restart silently     |
| Finalization uncertain | Complete sent, response lost                     | Inspect the object, reconcile D1, converge                    |
| Invariant broken       | State we do not understand                       | Fail safe, keep the evidence, stop                            |

Distinguish a database or storage outage from missing authorization. "We couldn't check your session" and "you're signed out" are different problems with different next steps.

## No fake heroics

If we cannot prove the local file is the same file, stop.

If the remote multipart upload no longer exists, say so.

If storage returns a state we do not understand, fail safe.

Reliability means trustworthy continuation, not continuation at any cost.

## Completion

Before marking a transfer complete, confirm all of these:

- the object exists at the expected key
- it has the expected size
- it belongs to this transfer
- the multipart upload is finalized
- accounting is recorded
- the recipient can get it

Multipart ETags and sampled fingerprints do not prove whole-file equality. Use stronger checksums wherever an integrity claim depends on them.

Keep recovery metadata until completion is known. "100% uploaded" and "finalized" are two different states and the UI shows them as two different states.

## Cancellation, expiry and cleanup

Cancel is a destructive domain action. Authorize it, stop local work, abort the remote multipart upload, and reconcile capacity and durable metadata. Retrying a cancel is safe.

Pause is not cancel. Closing the tab is not cancel. Unload is not cancel.

Expiry and confirmed abandonment can trigger cleanup too, but maintenance respects the advertised resume window. Cleanup racing active work is a scenario we test, not one we hope away.

## Downloads

An upload change is not finished until the recipient can download the correct file through an authorized link. Expiry is stated clearly on the page. Define download recovery, and do not make anyone redownload confirmed bytes where the client supports ranges.

## Authorization and abuse

Every create, sign, list, complete, abort and download checks identity, ownership, workspace membership where it applies, entitlement and transfer status. The object key and multipart ID are bound to the authorized transfer. A client-supplied upload ID never grants access to arbitrary storage. Resuming is not a way to read or write someone else's upload.

Before public uploads:

- enforce the creative-media allowlist by file signature, not extension
- reject archives and executables
- keep objects private and retention short
- add abuse reporting and admin disable and delete paths

## Diagnostics

Record transfer and multipart identities, recovery transitions, retries, file mismatches, authorization renewals and completion uncertainty.

Never log credentials, session tokens, signed URLs or file contents. A signed URL in a log is a working credential in a log.

Measure the things that matter: success rate, resume rate, bytes resent that did not need resending, manual interventions, retries and finalization failures.

## What the user sees

Failure should not make the product scream. Prefer:

```text
Connection lost. We'll continue when you're back online.
```

```text
We need the original file to continue.
217 GB is already uploaded.
```

Progress shows confirmed work. In-flight activity can be shown separately. Smooth the speed, keep the ETA approximate, and give a next action for offline, reselect file, permission required, upload expired and retrying.

The user should come out of a recovery still knowing what already arrived.

Never write "never fails." Nothing never fails. Claims we may make once the matching gate passes:

```text
Resumes interrupted transfers.
Parts already uploaded stay uploaded.
Lose Wi-Fi, pick up where you left off.
No starting a 300 GB project from zero because your connection blinked.
```

The customer should think "Tranzfer remembers." Not "I hope the tab stays open."

## Who owns what

- R2 owns uploaded parts and completed objects.
- D1 owns transfer identity, ownership and lifecycle.
- IndexedDB owns browser recovery metadata.
- Uppy owns active browser transport.
- Solid owns presentation. It displays the transfer and never decides its fate.

## The 350 GB story

Every upload design has to walk through this, step by step. If it cannot, the design is incomplete.

```text
A creator has a 350 GB project. They start the upload at night.

At 63% the router restarts. Ten minutes later the network is back.
At 71% the laptop goes to sleep. In the morning it wakes up.
At 79% the browser gets closed by accident.
Later the computer reboots for an update.

The creator opens Tranzfer again.
Tranzfer finds the unfinished transfer.
It restores access to the original file, or asks for it.
It verifies the file has not changed.
It asks R2 which parts exist.
It uploads only the missing parts.

The creator does not resend 276 GB.
The editor receives one correct file.
```

## Torture testing

Mocked tests are necessary. They are nowhere near sufficient. The product exists to survive real failure, so we cause real failure on purpose, on real files, and then check the final object, the domain state and the bytes resent. A reassuring progress bar is not evidence of anything.

Baseline sizes are 10 GB, 100 GB and 350 GB. Add 500 GB and 1 TB when real usage and plan limits justify them.

Before calling browser recovery done, break it in all of these ways:

- **Connectivity.** Offline, flapping, and switching networks mid-upload.
- **Requests.** Timeouts, throttling, 5xx, and authorization expiring during upload.
- **Browser lifecycle.** Refresh, tab close, browser restart, sleep and wake.
- **File access.** Permission loss, same-file reselection, a different file with the same name and size, a missing source file.
- **Remote state.** Stale local metadata, missing remote parts, paginated part listings, expired multipart uploads.
- **Completion.** Duplicate completion, completion with a lost response, interruption during finalization.
- **Races.** Explicit cancel and expiry cleanup racing active work.

## Release gates

| Gate                | Required evidence                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Internal            | 10 GB with network loss, failed-part retry and refresh                                                                    |
| Serious beta        | 100 GB with tab close, sleep and wake, authorization expiry and recovery                                                  |
| Reliability promise | 350 GB with router restart, browser restart, reselection, remote reconciliation and completion verification               |
| Reboot promise      | 350 GB with machine reboot, durable restoration, same-file verification and continuation of the existing multipart upload |

Do not market a gate before it passes. Record the environment, the failures injected, final object verification, manual steps and avoidable retransmission in the PR or issue.

New test files require explicit user approval under [AGENTS.md](../AGENTS.md). Otherwise use existing tests and direct runtime checks.

## Severity

| Level | Means                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------- |
| P0    | Silent corruption, access-control bypass, resuming the wrong user's upload                            |
| P1    | A recoverable huge upload restarts from zero, a completed file becomes unreachable, R2 and D1 diverge |
| P2    | Manual steps where recovery should be automatic, wrong progress after recovery                        |
| P3    | Confusing copy, silly ETA, cosmetic state glitches                                                    |

P0 drops everything. P1 comes next. P2 and P3 still get fixed, but they never jump ahead of correctness work.

## Reject on sight

Code review rejects any change that:

- keeps critical upload identity only in a component or signal
- builds a second upload state machine next to Uppy
- aborts uploads when a page, window or component disappears
- treats unload as cancel
- clears durable state before completion is known
- resumes based on filename alone
- trusts a local completed-part list without reconciling
- treats every error as fatal
- restarts a whole file after one failed part
- pre-signs thousands of future part URLs
- hardcodes a part size without reasoning about part limits
- marks a transfer complete before finalization
- swallows completion uncertainty
- logs signed URLs or credentials

## Questions every transfer PR answers

1. What durable state does this create?
2. What happens if the process dies on the next line?
3. What if the remote call succeeded and the response was lost?
4. What if local and remote disagree?
5. What if the local file changed?
6. Can this ever make the user resend confirmed bytes?
7. Is cancellation still explicit?
8. Does it survive refresh? Browser restart? Reboot?
9. Does it keep the desktop path open?
10. Which torture test proves it?

## Done, for the browser uploader

The browser uploader is done when:

- the 350 GB story above works end to end
- the reliability promise gate has passed and its evidence is in a PR
- the recipient downloads one correct, verified file through an authorized link
- every row of the failure taxonomy has a working response and honest copy
- nothing in "reject on sight" exists in the code

## Desktop, later

When desktop work starts, a separate background process owns file access, transport and SQLite recovery metadata. The renderer shows a snapshot. A renderer crashing never affects upload correctness. After any restart, the process reconciles with R2 exactly like the browser does.

Before claiming desktop recovery, verify tray and background operation, process restart, reboot, sleep and wake, network changes, an external drive disappearing, source file changes, an interrupted update, and bounded CPU, memory and disk use.

For receiving, add disk-space checks, destination rules, resume and integrity verification before any automatic remote cleanup. These wait until desktop work begins. They do not block web delivery.

## The two ways to fail

Overengineering. Given the choice between a beautiful generic transfer abstraction and a 350 GB upload that survives a router restart, pick the upload. Given a five-backend storage adapter and R2 resume working after a browser restart, pick resume. Given a perfect event-sourced architecture and a real editor finishing a failed upload, pick the editor.

Underengineering. "Don't overengineer" is not permission to ship fragile uploads. Multipart, retry, durable identity, reconciliation, same-file verification, safe finalization and real torture tests are not polish. For Tranzfer they are the product.

And don't let this file become a way to avoid users. The loop is build, break it, fix it, put it in front of a real human, repeat, ask for money. Theoretical failure modes nobody has hit wait their turn.

## The standard

Tranzfer should become the thing people reach for when the file is too big and too important to casually try again.

The connection may fail. The browser may disappear. The process may die. The machine may reboot. The transfer stays understandable, recoverable and safe.

The best reliability feature is not a clever retry loop. It is the user's belief, earned through repeated evidence, that they can walk away.

> I can leave this alone. Tranzfer will get it there.

Until that is true, make the next transfer more reliable than the last one.

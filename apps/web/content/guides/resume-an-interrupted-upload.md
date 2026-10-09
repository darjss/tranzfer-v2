---
title: How to resume an interrupted upload, and why uploads fail at 99%
description: "Can you resume an interrupted upload? Why uploads fail at 99%, what MASV, WeTransfer, Smash, Dropbox, Drive and Frame.io document, and how Tranzfer does it."
summary: Why long uploads die near the end, what each service actually documents about resuming, and exactly how Tranzfer picks up again.
answer: You can resume an interrupted upload only if the service kept the parts that already arrived and can match them to your files again, and most browser uploads can't, which is why an upload failed at 99% usually means starting over. Tranzfer keeps every part, so after a drop, sleep, closed tab or crash only the missing parts upload.
section: problems
order: 13
updated: 2026-10-09
related:
  - { href: /features/resume, label: How resume works }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
  - { href: /guides/wetransfer-file-too-big, label: WeTransfer file too big }
  - { href: /guides/dropbox-upload-stuck, label: Dropbox upload stuck }
  - { href: /guides/google-drive-upload-failing-large-files, label: Google Drive upload failing }
faq:
  - q: Why did my upload fail at 99%?
    a: Often because the last step, where the service puts the file together and confirms it, failed or its reply never reached your browser. Smash's help says a transfer stuck at 100% can't be restarted and has to be sent again.
  - q: Can I resume a WeTransfer upload?
    a: WeTransfer's help doesn't describe resuming. Its troubleshooting page says sleep mode cancels an upload and suggests restarting your computer and router.
  - q: Does closing the tab cancel my upload?
    a: On most browser uploads, yes. MASV's help says closing the browser tab or a computer crash means starting over. On Tranzfer you open it again, pick the same files, and only the missing parts upload.
  - q: Will my upload continue while my laptop is asleep?
    a: No. A sleeping laptop uploads nothing on any service. Tranzfer carries on when it wakes, but the hours asleep are hours lost, so keep it awake and plugged in.
---

## Why do uploads fail late?

A long upload doesn't fail because it's big. It fails because it runs for hours, and something breaks in those hours. There are four usual suspects.

**One long request.** Some uploads send the file as a single stream. Any break, even a two-second Wi-Fi drop, loses the lot. The fix is to send the file in parts, but parts only help if the service remembers which ones arrived and your browser can find them again after a reload.

**Expiring permission.** Many uploads run on a permission that expires, a signed address or a session that's good for a few hours. A 300 GB upload on a 50 Mbps line runs 13 hours 20 minutes at full speed. If the tool doesn't renew that permission, the upload outlives it.

**Sleep.** A laptop that sleeps stops sending. WeTransfer's [troubleshooting page](https://wetransfer.com/help-center/troubleshooting/upload-fails-error) says plainly that sleep mode cancels an upload.

**The last step.** At the end, the service assembles the parts and confirms the file. If that reply gets lost, the bar sits at 99% or 100% and nothing happens. Smash's help on [transfers stuck at 100%](https://fromsmash.com/help/articles/12985104-my-transfer-gets-stuck-at-100) says "there is no way to restart the upload, the only solution is to start the process once again."

## What does each service say about resuming?

Not much, and that's the point of this table. Where a vendor's help doesn't say, we say so.

| Service      | After a dropped connection                                         | After a closed tab, crash or reboot                                       |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Tranzfer** | Retries by itself, and carries on after sleep                      | Pick the same files again and only the missing parts upload               |
| MASV         | Browser retries until the connection comes back                    | Browser starts over. The desktop app recovers from most, reboots included |
| WeTransfer   | Not documented. Sleep cancels the upload                           | Not documented                                                            |
| Smash        | Not documented. Keep the computer off standby                      | A transfer stuck at 100% has to be sent again                             |
| Filemail     | Not documented for the browser                                     | The desktop app resumes. No page says the browser does                    |
| Dropbox      | Desktop app recommended for large files. Transfer help doesn't say | Not documented                                                            |
| Google Drive | Drive for desktop retries later and uses Lost and Found            | Not documented for the browser. The API has resumable uploads             |
| Frame.io     | The web upload sheet can pause and resume                          | Not documented for the browser. Frame.io Drive resumes with no loss       |

Sources, all read on 9 October 2026: [MASV](https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload), [WeTransfer](https://wetransfer.com/help-center/troubleshooting/upload-fails-error), [Smash](https://fromsmash.com/help/articles/12985104-my-transfer-gets-stuck-at-100), [Filemail desktop app](https://www.filemail.com/apps/desktop), [Dropbox upload limits](https://help.dropbox.com/sync/upload-limitations), [Dropbox Transfer](https://help.dropbox.com/share/dropbox-transfer), [Drive for desktop](https://support.google.com/drive/answer/2565956), [Drive API uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Frame.io uploads](https://help.frame.io/en/articles/9090654-getting-started-how-do-i-upload-media) and [Frame.io Drive](https://help.frame.io/en/articles/14501692-how-to-transfer-upload-download-in-frame-io-drive).

The desktop apps that say anything say they resume. In the browser it's thin. MASV retries while the tab stays open, Frame.io has a pause button, and the only service that says what a closed tab does is MASV, where the answer is start over.

## How does Tranzfer resume?

Tranzfer uploads every file in parts and keeps each part that arrives. What happens next depends on what broke.

1. **The connection drops.** Tranzfer retries by itself. You don't have to touch anything.
2. **The laptop sleeps.** Nothing uploads while it's asleep, on Tranzfer or anywhere else. When it wakes, the upload carries on from where it was.
3. **The tab closes, the page reloads or the browser crashes.** Open Tranzfer again and pick the same files or folder. Only the parts that are missing upload.
4. **You pick the wrong file.** Before it carries on, Tranzfer checks that the files you picked match what already arrived. A different file with the same name gets refused, so a new export can't quietly splice into an old one.

Be clear about what that buys you. Resume saves the work, not the time. If the laptop slept for six hours, you lost six hours of upload. And after a crash, Tranzfer doesn't restart itself. You have to come back and pick the files. The full detail is on [how resume works](/features/resume).

## How do we know it works?

We break it on purpose. The release test uploads 100 GiB, about 107 GB, from a browser while we interrupt it eight times. It goes offline for 90 seconds, gets a rejected part, a reload, a closed tab, a 20-minute freeze, a browser crash, a wrong file picked, and a lost final response. That last one is the 99% failure from above.

It finished in 56 minutes, freeze included, and the file matched the original byte for byte. Between failures it ran at 74 to 75 MiB/s, about 620 Mbps. That was on a data-centre machine, not a home connection, so your times will be longer. The [upload time calculator](/tools/upload-time-calculator) gives a realistic figure for your line.

## How do I keep a long upload from failing at all?

- Plug in power and set the laptop not to sleep while it's plugged in.
- Use an ethernet cable if you can. Hotel and café Wi-Fi drops more than you'd think.
- Pause cloud backups and sync apps, which share the same upload.
- Don't move, rename or edit the files after you start. WeTransfer warns about this too.
- Start big uploads early enough that a night's sleep isn't the deadline.

## When should you use something else?

If your machine reboots for updates overnight and you won't be there, a desktop app that recovers on its own is a better fit. MASV's and Filemail's desktop apps both say they resume, and Tranzfer has no desktop app. If your team already reviews in Frame.io, its Drive app resumes too and keeps you in one place. For anything else, the [pillar guide on sending large files](/guides/how-to-send-large-files) covers which tool fits which size, and the pages on [WeTransfer file too big](/guides/wetransfer-file-too-big), [Dropbox upload stuck](/guides/dropbox-upload-stuck) and [Google Drive upload failing](/guides/google-drive-upload-failing-large-files) cover each service's own limits.

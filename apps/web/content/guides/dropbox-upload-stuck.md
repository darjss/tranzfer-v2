---
title: Dropbox upload stuck? How to get a large upload moving again
description: Dropbox upload stuck on a big file? Dropbox's browser size warnings, the desktop app fixes, Transfer's 95 GB folder note, and when to use something else.
summary: Dropbox warns that browser uploads past 350 to 375 GB can time out. The fixes Dropbox documents, and what to do with Transfer.
answer: If your Dropbox upload is stuck on a large file in the browser, move it to the Dropbox desktop app, which is what Dropbox itself recommends, because its help says browser uploads over 375 GB may time out or be interrupted. If the desktop app is the one stuck, check your storage quota, the file name and whether another app has the file open.
section: problems
order: 12
updated: 2026-10-09
related:
  - { href: /alternatives/dropbox-transfer, label: Dropbox Transfer alternatives }
  - { href: /guides/resume-an-interrupted-upload, label: Resume an interrupted upload }
  - { href: /guides/google-drive-upload-failing-large-files, label: Google Drive upload failing }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
faq:
  - q: What is the largest file I can upload to Dropbox?
    a: 2 TB per file through the desktop app or the API. In the browser, one Dropbox page says 350 GB per file or folder and another warns that files over 375 GB may time out, so plan around 350 GB.
  - q: Why is my Dropbox upload stuck at the same percentage?
    a: Dropbox's help names a few causes, including going over your storage quota, a file another app has open or locked, special characters in the name, and a firewall or proxy blocking the app. Start with the quota, since being over it stops syncing entirely.
  - q: Does a Dropbox Transfer upload resume if it's interrupted?
    a: Dropbox's Transfer help page doesn't say. It only suggests that folders close to the 100 GB limit with deep nesting or thousands of files can have upload issues, and recommends keeping them to 80 to 90 GB or splitting them.
  - q: Should I zip a large folder before uploading to Dropbox?
    a: Dropbox suggests compressing files to get under the browser limit, but video, RAW photos and compressed audio barely shrink. The desktop app is the better fix.
---

## Why does a Dropbox upload get stuck?

For big files there are two different problems, and they need different fixes. Either the browser is being asked to do something Dropbox says it isn't reliable at, or the desktop app has hit something that blocks sync.

## Is the file too big for the browser?

Dropbox gives two numbers for this, and they don't agree. The [upload limits page](https://help.dropbox.com/sync/upload-limitations), updated 17 June 2026, says "Uploading files larger than 375 GB in a web browser may cause timeouts or interrupted uploads." The page on [adding files](https://help.dropbox.com/create-upload/add-files) says "Each file or folder uploaded on dropbox.com can be up to 350 GB." Use the lower one. The second page also counts a whole folder against it, which catches people uploading a shoot folder rather than one file.

Both pages point the same way. "For the best results, use the Dropbox desktop app or the Dropbox API." The desktop app takes files up to 2 TB. Dropbox also says large uploads "may also be unreliable on mobile devices", so don't start a 100 GB upload from a phone.

Dropbox suggests compressing the file to get under the browser limit. For footage, RAW photos and audio stems that barely works, because they're compressed already.

## How do I unstick it?

These steps come from Dropbox's own help, mostly its page on [files not syncing](https://help.dropbox.com/sync/files-not-syncing). Work down the list.

1. **Wait a few minutes.** Dropbox says a very large file or an unreliable connection can make sync slower, and the app may just be catching up.
2. **Check your storage.** "If you're over your storage quota, Dropbox will stop syncing." Every file also has to be smaller than your total storage space.
3. **Close other apps that have the file open.** Some applications lock files while they're open. Dropbox says to close all non-Dropbox applications. A read-only or locked file won't sync at all.
4. **Fix the name and path.** Remove special characters like `*` or `/` from file names, and keep the full path under 260 characters.
5. **Check the bandwidth setting.** In the desktop app, open the account menu, then Preferences, then the Network tab. If [Custom bandwidth](https://help.dropbox.com/installs-integrations/sync-uploads/bandwidth) is on with a low upload rate, toggle it off so Dropbox manages bandwidth itself.
6. **Check the network.** A firewall, antivirus or proxy can block sync. On restricted networks you may need to enter proxy details or allow Dropbox's domains.
7. **Quit and relaunch the app, then restart the computer.** Dropbox suggests the restart in case a crashed background app is holding your files.

One more thing Dropbox doesn't spell out but the maths does. A slow upload can look stuck. 300 GB on a 50 Mbps upload takes 13 hours 20 minutes at full speed. Check the [upload time calculator](/tools/upload-time-calculator) before deciding something's broken.

## What about Dropbox Transfer?

Dropbox Transfer sends a copy by link and has its own size limits per plan, from Dropbox's [Transfer help page](https://help.dropbox.com/share/dropbox-transfer), updated 24 September 2026.

| Plan                                                              | Largest transfer | Link expiry                    |
| ----------------------------------------------------------------- | ---------------- | ------------------------------ |
| Basic                                                             | 2 GB             | 7 days                         |
| Plus, Family                                                      | 50 GB            | 7 days                         |
| Standard, Professional, Education, Essentials, Advanced, Business | 100 GB           | You choose, 30 days by default |
| Business Plus, Enterprise, or the Replay add-on                   | 250 GB           | You choose, 30 days by default |

The same page has a warning for folders. Folders very close to the 100 GB limit, 95 GB and up, with deep nesting or thousands of files "can occasionally experience upload issues". Dropbox's fix is to cut the folder to 80 to 90 GB or split it into several transfers. The page doesn't say whether an interrupted Transfer upload resumes.

## When should you use something else?

If the job is handing a big delivery to someone else rather than storing it, a transfer tool is often simpler than fighting Dropbox's browser limits. Tranzfer runs in the browser with no 350 GB ceiling. One file or folder can be as big as your plan holds at once, up to 3 TB on Studio, and folders keep their structure. The recipient opens the link and downloads with no account.

The part Dropbox leaves unsaid is what happens when the upload breaks. On Tranzfer a dropped connection retries by itself, and a sleeping laptop carries on when it wakes. After a crash or a closed tab, you open Tranzfer, pick the same files, and only the missing parts upload. [How resume works](/features/resume) explains it, and [resuming an interrupted upload](/guides/resume-an-interrupted-upload) compares what each service documents.

Dropbox is the better pick when:

- The files should live in Dropbox afterwards. Tranzfer deletes them when the link ends, after 14 days at most.
- You want a desktop app syncing in the background. Tranzfer has no desktop app.
- You need password-protected links, which Dropbox Transfer offers on Standard and up. Tranzfer doesn't.

Google Drive has its own version of this problem, covered in [Google Drive upload keeps failing](/guides/google-drive-upload-failing-large-files). For tool choice by size, see [how to send large files](/guides/how-to-send-large-files).

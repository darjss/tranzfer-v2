---
title: How to send large files
description: "How to send large files, from 1 GB to 1 TB: which tool fits which size, how to prepare the files, and how to keep a long upload from starting over."
summary: Use a transfer link, not email. Which tool fits which size, and what to do so a 200 GB upload doesn't die at 63%.
answer: To send a large file, upload it to a file transfer service and send the recipient the download link. Email stops at about 25 MB, most free transfer plans stop between 2 and 5 GB, and past 50 GB the thing that matters most is whether the upload survives an interruption.
order: 1
updated: 2026-10-09
related:
  - { href: /features/send-large-files, label: Send huge files }
  - { href: /features/resume, label: Resume anything }
  - { href: /features/folders, label: Send whole folders }
  - { href: /alternatives/wetransfer, label: WeTransfer alternatives }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
faq:
  - q: Can I email a 1 GB file?
    a: Not as an attachment. Personal Gmail stops at 25 MB and swaps anything bigger for a Google Drive link. Upload the file to a transfer service and email the link instead.
  - q: How do I send 50 GB for free?
    a: Tranzfer Free holds 20 GB live at once. Send that much, cancel the link once it's downloaded, and the space comes back for the next batch. Smash Free also takes bigger files but queues anything over 2 GB behind paying users.
  - q: Should I zip large files before sending?
    a: Usually not. Video, photos and audio are already compressed, so a zip barely shrinks them. It also needs as much free disk as the files themselves and adds a long wait before the upload starts. Send the folder as it is.
  - q: What if my upload fails halfway?
    a: On Tranzfer, no. Every part that arrived is kept. After a dropped connection it retries by itself, after sleep it carries on, and after a crash or closed tab you pick the same files and only the missing parts upload.
  - q: Does the recipient need an account?
    a: No. On Tranzfer, MASV, WeTransfer and Dropbox Transfer the recipient opens the link and downloads.
---

## What counts as a large file?

It depends on what you're sending it through. Personal Gmail allows 25 MB of attachments and turns anything bigger into a [Google Drive link](https://support.google.com/mail/answer/6584). Free transfer plans cap you somewhere between 2 and 5 GB. A wedding in RAW is 50 to 150 GB. An hour of 4K ProRes 422 HQ is about 318 GB. Pick the tool by the size you actually have.

| Size          | What works                                                                | Watch out for                                                  |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Under 25 MB   | An email attachment                                                       | Work accounts can set lower limits                             |
| 25 MB to 2 GB | Any free transfer service, or a shared Drive or Dropbox link              | WeTransfer Free allows 10 transfers or 3 GB in 30 days         |
| 2 to 50 GB    | A paid transfer plan, Tranzfer Free up to 20 GB, Dropbox Transfer on Plus | Uploads now take an hour or more on a home connection          |
| 50 GB to 3 TB | A transfer tool that resumes: Tranzfer, MASV, Filemail's desktop app      | An upload that restarts from zero after a drop or a closed tab |
| Over 3 TB     | MASV, Filemail Business, or a drive in the post                           | Per-GB bills; check the price before you start                 |

## How do I send a large file, step by step?

1. **Check the total size.** On a Mac, select the folder and press Command-I. On Windows, right-click and choose Properties. Windows shows GiB, which reads about 7% smaller than the GB transfer services count in.
2. **Keep the folder as it is.** Don't zip it and don't split it. Folder names tell the other person what's what, and zipping 200 GB of video saves almost nothing.
3. **Pick a tool that fits the size** from the table above. Past 50 GB, check what happens when the upload is interrupted. Most services don't say.
4. **Give the upload a fair chance.** Plug in power and, if you can, an ethernet cable. Pause cloud backups and sync apps, which compete for the same upload speed.
5. **Send the link and say when it expires.** Tranzfer links last up to 3 days on Free, 7 on Starter and 14 on Pro and Studio. Then the files are deleted.

## How long will the upload take?

Upload speed decides it, and it's usually much lower than your download speed. At 50 Mbps, 100 GB takes about 4 hours 27 minutes with the line running flat out. At 20 Mbps it's over 11 hours. Put your own numbers into the [upload time calculator](/tools/upload-time-calculator), or read [how long it takes to upload 100 GB](/guides/how-long-to-upload-100-gb) for what slows it down.

## What happens if the upload fails halfway?

This is where tools differ most, and where they say least. A long upload will meet a Wi-Fi blip, a laptop lid or a browser update. Some services keep retrying while the tab stays open. Fewer survive the tab closing. MASV's help page says that in the browser a closed tab or a crash means starting over; their desktop app recovers.

Tranzfer keeps every part that arrived. A dropped connection retries by itself. A sleeping laptop carries on when it wakes. After a crash or a closed tab, open Tranzfer, pick the same files, and only the missing parts upload. It checks that the files you picked match what already arrived and refuses a different file with the same name. We test that on a 100 GB upload with eight failures forced on purpose, including a browser crash and a 20-minute freeze.

## Which service should I use?

For a few gigabytes, use whatever your recipient already knows. For hundreds of gigabytes from a browser, we built [Tranzfer](/features/send-large-files) for exactly that. If you'd rather compare first, there's a ranked list of [WeTransfer alternatives](/alternatives/wetransfer) with prices and limits, and one for [MASV alternatives](/alternatives/masv). If you send footage, photos or sessions, the guides for [video](/guides/send-large-video-files-to-an-editor), [RAW photos](/guides/send-raw-photos-to-a-client) and [Pro Tools and Logic sessions](/guides/send-pro-tools-or-logic-session) cover what to put in the folder.

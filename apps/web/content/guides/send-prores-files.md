---
title: How to send ProRes files
description: "How to send ProRes files without re-encoding: sizes from Apple's ProRes white paper, how long the upload takes, and how to send card folders as one link."
summary: Send the .mov files untouched, in their folders, through a transfer that resumes. Apple's own numbers for how big ProRes gets.
answer: To send ProRes files, upload the original .mov files in their folders to a transfer service that resumes interrupted uploads and send the link. Don't re-encode or zip them. ProRes is big, about 318 GB an hour for UHD 422 HQ at 24 fps, so plan the upload before you plan anything else.
section: formats
order: 30
updated: 2026-10-09
related:
  - { href: /guides/send-large-video-files-to-an-editor, label: Send video files to an editor }
  - { href: /guides/send-braw-footage, label: Send BRAW footage }
  - { href: /guides/send-r3d-files-to-an-editor, label: Send R3D files to an editor }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
  - { href: /for/editors, label: For editors }
faq:
  - q: How big is an hour of ProRes 422 HQ?
    a: Apple's white paper puts it at 79 GB an hour for 1080p at 24 fps and 318 GB an hour for UHD at 24 fps. At 30 fps it's 99 GB and 398 GB.
  - q: Should I zip ProRes files before sending them?
    a: No. ProRes is already compressed, so a zip saves almost nothing and adds a long wait on both ends. Send the folder as it is.
  - q: Can I send ProRes Proxy instead of the full files?
    a: Yes, if your editor is happy to cut on proxies and relink later. Proxy is about a fifth the size of 422 HQ at the same frame size and rate, so it can go first and the originals after.
  - q: How big is ProRes RAW?
    a: Apple says ProRes RAW generally falls between ProRes 422 and 422 HQ, and ProRes RAW HQ between 422 HQ and 4444. Apple doesn't publish a fixed table because the rate depends on the image.
---

## How big are ProRes files?

Bigger than most people plan for. Every number here is a target rate from Apple's [ProRes white paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf) (April 2022), in GB an hour. Apple notes real files sit close to the target and never more than about 10 percent above it.

| Format and frame rate   | Proxy | 422 LT | 422 | 422 HQ | 4444 | 4444 XQ |
| ----------------------- | ----- | ------ | --- | ------ | ---- | ------- |
| 1080p, 24 fps           | 16    | 37     | 53  | 79     | 119  | 178     |
| 1080p, 30 fps           | 20    | 46     | 66  | 99     | 148  | 223     |
| UHD 3840 x 2160, 24 fps | 65    | 148    | 212 | 318    | 477  | 716     |
| UHD 3840 x 2160, 30 fps | 82    | 185    | 265 | 398    | 597  | 895     |

The 4444 numbers are without alpha. Apple says an alpha channel usually adds only a little. Frame rate scales the rate directly, so UHD 422 HQ at 60 fps is 795 GB an hour.

If you shot [ProRes RAW](https://www.apple.com/final-cut-pro/docs/Apple_ProRes_RAW.pdf), Apple doesn't give a table. Its white paper says ProRes RAW generally lands between 422 and 422 HQ, and ProRes RAW HQ between 422 HQ and 4444, and that detailed or noisy images come out bigger.

## How long will the upload take?

Longer than the shoot, usually. One hour of UHD 422 HQ at 24 fps is 318 GB. On a 100 Mbps upload that's 7 hours 4 minutes at full speed and about 8 hours 50 minutes at a more honest 80 percent. On 50 Mbps it's over 17 hours. On a 500 Mbps office line it's under 2 hours.

Plug your own numbers into the [upload time calculator](/tools/upload-time-calculator). Then pick a start time that lets it finish before your editor sits down.

## How do I prepare ProRes files for sending?

1. **Leave the files alone.** Send the .mov files the camera or recorder wrote. Re-exporting costs hours and hands your editor a copy instead of the original.
2. **Keep the card folders.** Copy each card or recorder drive into its own folder with a checksum tool, then send those folders. `Day1/A-cam/A001` and `Day1/Sound` is a layout most editors recognise.
3. **Don't zip.** ProRes is already compressed, so a zip barely shrinks it and needs as much free disk again. Tranzfer sends folders as folders.
4. **Decide whether proxies go first.** ProRes Proxy is about a fifth of 422 HQ at the same size and rate (65 vs 318 GB an hour in UHD at 24 fps). If the originals won't arrive in time, send proxies tonight and the originals after.
5. **Add a short note.** Codec, frame rate, which cards are which, and anything that went wrong on the day.

## How do I send it with Tranzfer?

Sign in with Google, drag the shoot folder in, pick how long the link lasts, and start. Subfolders arrive the way you sorted them.

The part that matters for ProRes is what happens at hour six. If the Wi-Fi drops, Tranzfer retries by itself. If the laptop sleeps, it carries on when it wakes, though a sleeping laptop uploads nothing, so keep it awake if you want the time back. If the browser crashes or you close the tab, open Tranzfer, pick the same folder, and only the missing parts upload. It checks the files match what already arrived and refuses a different file with the same name.

Your editor opens the link with no account. On desktop Chrome or Edge, Download all saves the whole delivery into one folder, subfolders included, and picks up again if the download is interrupted.

Plan sizes are live space, not a monthly total. Free holds 20 GB, about 15 minutes of 1080p 422 HQ at 24 fps. Starter holds 300 GB for $15 a month, Pro 1 TB for $29, and Studio 3 TB for $69. See [pricing](/pricing).

## When should you use something else?

- **You need review and comments.** Tranzfer has no player and no frame-accurate notes. [Frame.io](https://frame.io/pricing) does, from $15 per member a month on Pro.
- **The files should stay up for months.** Tranzfer links last 14 days at most and the files are deleted when they end. A shared Google Drive or Dropbox folder keeps them until you delete them.
- **You want a desktop app or accelerated UDP transfer.** We don't have either. MASV has a desktop app and charges [$0.25 per GB](https://masv.io/pricing) after the first 15 GB a month.
- **You have over 3 TB at once.** That's past our biggest plan. Ship a drive, or split the job into batches.

There's more on handing over a whole shoot in [how to send large video files to an editor](/guides/send-large-video-files-to-an-editor).

---
title: How to send 300 GB of video footage
description: How to send 300 GB of video footage from a shoot. Keep the card folders, send proxies first, plan an overnight upload, and pick a plan that holds it all.
summary: A 300 GB shoot is an overnight upload on most home lines. Keep the cards intact, send proxies first, and use a transfer that resumes.
answer: To send 300 GB of video footage, upload the whole shoot folder with each card left intact to a transfer that resumes, and send proxies first if the editor needs to start before the originals land. At 50 Mbps, 300 GB takes 13 h 20 min at full speed, so plan on an overnight upload.
section: sizes
order: 21
updated: 2026-10-09
related:
  - {
      href: /guides/send-large-video-files-to-an-editor,
      label: Send large video files to an editor,
    }
  - { href: /guides/send-4k-footage-to-a-remote-editor, label: Send 4K footage to a remote editor }
  - { href: /guides/transfer-1tb-of-files, label: Transfer 1 TB of files }
  - { href: /for/videographers, label: For videographers }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
faq:
  - q: How much footage is 300 GB?
    a: About 57 minutes of UHD 4K ProRes 422 HQ at 24 fps, or about 3 h 48 min of 1080p ProRes 422 HQ, going by Apple's ProRes white paper. Camera RAW formats vary, so check your own cards.
  - q: Does 300 GB fit on Tranzfer Starter?
    a: Exactly, with nothing to spare. Starter holds 300 GB live at once. If you add proxies, sound or a second link on top, move to Pro, which holds 1 TB.
  - q: Should I send proxies or originals?
    a: Both, in that order, if the editor wants to start soon. Proxies of 300 GB of UHD ProRes 422 HQ come to about 61 GB and upload in under 3 hours at 50 Mbps. The originals follow overnight.
  - q: Can I send the camera cards as they are?
    a: Yes. Copy each card into its own folder and send the shoot folder. Tranzfer keeps every subfolder, so the editor gets the same structure you had.
---

## How much shoot is 300 GB?

Less than it sounds. Going by Apple's [ProRes white paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf), at 24 fps 300 GB holds about:

- 57 minutes of UHD 4K ProRes 422 HQ (318 GB an hour)
- 85 minutes of UHD 4K ProRes 422 (212 GB an hour)
- 3 h 48 min of 1080p ProRes 422 HQ (79 GB an hour)

Two 4K cameras rolling ProRes 422 HQ for half an hour each already come to 318 GB. Camera RAW is a different story for every camera and setting. Check the card, not the spec sheet.

## How long will 300 GB take to upload?

|            | 20 Mbps     | 50 Mbps     | 100 Mbps   | 500 Mbps   | 1 Gbps |
| ---------- | ----------- | ----------- | ---------- | ---------- | ------ |
| Full speed | 33 h 20 min | 13 h 20 min | 6 h 40 min | 1 h 20 min | 40 min |
| At 80%     | 41 h 40 min | 16 h 40 min | 8 h 20 min | 1 h 40 min | 50 min |

Full speed is the math. The 80% row is the one to plan on, because a real upload rarely holds the full line rate for half a day. On a 50 Mbps home upload, that's a whole night and some of the morning. On 20 Mbps, it's most of two days. Run your own speed in the [upload time calculator](/tools/upload-time-calculator).

## How should I prepare the footage?

1. **Offload and verify each card** with a copy tool that checks its work. A transfer only delivers what's on your drive.
2. **Leave the card structure alone.** One folder per card, inside a folder per camera and day, like `Day1/A-cam/A001`. Cameras write sidecar files next to the clips and editing apps expect them there.
3. **Put the sound, LUTs and a short notes file in the same shoot folder.** One link, one place to look.
4. **Check the total before you pick a plan.** Windows shows GiB and calls it GB, so 300 GB reads as about 279 there. If Explorer says 285, you have about 306 GB, and that won't fit in 300.

## Why send proxies first?

Because 13 hours is a long time for an editor to wait. Proxies in UHD ProRes 422 Proxy run about 65 GB an hour against 318 for 422 HQ. So 300 GB of HQ originals comes to about 61 GB of proxies, which take 2 h 43 min at 50 Mbps. Send those in the evening and the editor can start in the morning while the originals are still going up.

Keep the proxy file names identical to the originals so the editor can relink later.

There's a catch with plan space. Starter holds 300 GB live at once, and 61 GB of proxies plus 300 GB of originals is 361. Either cancel the proxy link once it's downloaded, which frees the space, or use Pro, which holds 1 TB and lets links last up to 14 days.

## What if the upload breaks overnight?

On a 13-hour upload, something will. On Tranzfer, a Wi-Fi drop retries by itself, and a sleeping laptop carries on when it wakes. A crash or a closed tab costs you the parts in flight. Open Tranzfer, pick the same shoot folder, and only the missing parts upload. It checks the files match what already arrived and won't take a different clip that happens to share a name.

What it can't do is upload while the laptop sleeps. Resume saves the work, not the time. Plug in, turn off sleep, and pause cloud backups before bed.

## What does the editor get?

One link. No account, nothing to install. On desktop Chrome or Edge, Download all asks for a folder once and saves the whole shoot into it, subfolders and all, and carries on if the download is interrupted. In other browsers it's file by file. The [editors page](/for/editors) covers that side.

## When should you use something else?

- **You're on a 20 Mbps line and shoot every day.** Two days of uploading per 300 GB won't keep up. A drive in a courier's bag does.
- **The editor needs to leave comments on cuts.** Tranzfer has no comments or review. [Frame.io](https://frame.io/pricing) does that, with 2 TB on Pro at $15 per member a month.
- **You want an installed uploader.** We're browser only. MASV and Filemail both have desktop apps.

For the full handover between a shooter and an editor, see [how to send large video files to an editor](/guides/send-large-video-files-to-an-editor). If your shoot is closer to a terabyte, read [how to transfer 1 TB of files](/guides/transfer-1tb-of-files).

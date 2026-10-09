---
title: How to send BRAW footage
description: "How to send BRAW footage: Blackmagic's own data rates, which .braw, .sidecar and proxy files to keep together, and how to send each card as one link."
summary: Send the card folders with every .braw clip, its .sidecar file and its proxy side by side. Blackmagic's own numbers for how big it gets.
answer: To send BRAW footage, copy each card into its own folder, keep every .braw clip next to its .sidecar file and proxy, and send those folders through a transfer that resumes. Blackmagic RAW is big. Blackmagic's spec sheet puts 6K open gate at 3:1 at 370 MB/s, which is about 1.3 TB an hour.
section: formats
order: 31
updated: 2026-10-09
related:
  - { href: /guides/send-prores-files, label: Send ProRes files }
  - { href: /guides/send-r3d-files-to-an-editor, label: Send R3D files to an editor }
  - { href: /guides/send-large-video-files-to-an-editor, label: Send video files to an editor }
  - { href: /features/folders, label: Send whole folders }
  - { href: /for/videographers, label: For videographers }
faq:
  - q: What is a .sidecar file in Blackmagic RAW?
    a: A small, human readable JSON file that holds Blackmagic RAW settings and metadata for one clip. It overrides the settings embedded in the .braw file without changing it, but only when it sits in the same folder as the clip.
  - q: Do I need to send the .sidecar files?
    a: Yes, if anyone changed RAW settings in DaVinci Resolve or wrote metadata. Without them your editor sees the clip as it was shot. They're tiny, so there's no reason to leave them out.
  - q: How big is an hour of BRAW?
    a: On the Blackmagic Cinema Camera 6K at 30 fps, Blackmagic lists 6K open gate at 370 MB/s for 3:1 and 94 MB/s for 12:1. That's about 1.3 TB and 340 GB an hour.
  - q: Can I send the proxies first?
    a: Yes. The Cinema Camera 6K records 1920 x 1080 H.264 proxies with the same file names as the .braw clips, so your editor can cut on them and relink later.
---

## How big is Blackmagic RAW footage?

It depends on the camera, the resolution and the quality setting. Blackmagic publishes storage rates on each camera's tech specs page. These are for the [Blackmagic Cinema Camera 6K](https://www.blackmagicdesign.com/products/blackmagiccinemacamera/techspecs), at 30 frames per second, with our GB-an-hour figure (MB/s times 3,600) next to each.

| Resolution               | 3:1                  | 5:1                | 8:1                | 12:1              |
| ------------------------ | -------------------- | ------------------ | ------------------ | ----------------- |
| 6K open gate 6048 x 4032 | 370 MB/s, 1,332 GB/h | 223 MB/s, 803 GB/h | 140 MB/s, 504 GB/h | 94 MB/s, 338 GB/h |
| 6K DCI 6048 x 3200       | 295 MB/s, 1,062 GB/h | 177 MB/s, 637 GB/h | 111 MB/s, 400 GB/h | 75 MB/s, 270 GB/h |
| 4K DCI 4096 x 2160       | 136 MB/s, 490 GB/h   | 82 MB/s, 295 GB/h  | 52 MB/s, 187 GB/h  | 35 MB/s, 126 GB/h |
| HD 1920 x 1080           | 33 MB/s, 119 GB/h    | 20 MB/s, 72 GB/h   | 13 MB/s, 47 GB/h   | 9 MB/s, 32 GB/h   |

Constant quality settings don't have one number. The same page lists Q0 at 6K open gate as 278 to 555 MB/s and Q5 as 75 to 186 MB/s, and says these figures are indicative only because the rate depends on what's in the frame. Other Blackmagic cameras have their own tables, and the [data rate calculator](https://www.blackmagicdesign.com/products/blackmagiccinemacamera/blackmagicraw) on the Blackmagic RAW page lets you set your own frame rate and card size.

Blackmagic doesn't publish a data rate for the H.264 proxies, so check the size on your card.

## Which files belong together?

[Blackmagic](https://www.blackmagicdesign.com/products/blackmagicraw) stores each clip as a single .braw file, not an image sequence, and says that makes file transfers faster than other RAW formats. A clip can come with three kinds of file, and the [Cinema Camera manual](https://documents.blackmagicdesign.com/UserManuals/BlackmagicCinemaCameraManual.pdf) explains each:

- **The .braw clip.** A name like `A001_08151512_C001.braw` encodes camera, reel, month, day, hour, minute and clip number. Camera metadata is embedded in the file, and a 3D LUT can be too.
- **The .sidecar file.** JSON metadata that overrides what's embedded, without overwriting the original. DaVinci Resolve writes one when you save Camera RAW changes. The manual says that if the sidecar is moved out of the clip's folder, the clip opens as originally shot. Keep each one next to its .braw.
- **The proxy.** The Cinema Camera 6K records 1920 x 1080 H.264 proxies with the same name and a .MP4 suffix. Send them if your editor works on a modest machine or wants to start early.

The safe rule is simple. Don't flatten the card, don't rename clips, and send each card folder whole.

## How do I prepare BRAW for sending?

1. **Offload with verification.** Use a copy tool that checks what it copied. A transfer only delivers what's on your drive.
2. **One folder per card.** `Day1/A-cam/A001`, `Day1/B-cam/B001`, `Day1/Sound`. Put LUTs and a notes file in the shoot folder.
3. **Save sidecars before you send.** If you graded or set RAW settings in Resolve and want your editor to see them, save them to sidecar files first, then send.
4. **Decide on proxies.** If an hour of 3:1 open gate (about 1.3 TB) won't finish tonight, send the proxies first and the .braw folders after.

## How long will it take to upload?

One hour of 6K open gate at 8:1 is about 504 GB. On a 100 Mbps upload that's 11 hours 12 minutes at full speed and about 14 hours at 80 percent. At 3:1 the same hour is 1,332 GB, which is about 37 hours on that line at 80 percent. The [upload time calculator](/tools/upload-time-calculator) does your numbers.

That's why resume matters more than raw speed here. On Tranzfer, a dropped connection retries by itself and a sleeping laptop carries on when it wakes. After a crash or closed tab, pick the same folders again and only the missing parts upload. Tranzfer checks the files match what already arrived, so a different clip with the same name is refused.

## How do I send it with Tranzfer?

Sign in with Google, drag the shoot folder in, pick how long the link lasts. Folders keep their structure, so every .sidecar stays beside its .braw. Your editor opens the link with no account. On desktop Chrome or Edge, Download all saves the whole delivery into one folder with its subfolders.

Size the plan to what's live at once. Free holds 20 GB, Starter 300 GB, Pro 1 TB and Studio 3 TB. An hour of 6K open gate at 3:1 needs Studio. Details on [pricing](/pricing).

## When should you use something else?

- **Your team already lives in Blackmagic Cloud.** The manual describes uploading proxies, or proxies and originals, straight from the camera to Blackmagic Cloud projects. We don't connect to it.
- **You need review and notes on the cut.** Tranzfer has no player. Note that [Frame.io V4 doesn't support DaVinci Resolve](https://help.frame.io/en/articles/9893008-what-to-expect-when-updating-to-v4-a-comprehensive-guide-for-enterprise-customers), which matters for a BRAW workflow.
- **More than 3 TB at once, or files kept for months.** That's past our biggest plan and our 14-day link limit. Ship a drive or use shared storage.

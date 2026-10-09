---
title: How to send 4K footage to a remote editor
description: How to send 4K footage to a remote editor. Proxies and sound go first, originals upload overnight, and folder names, LUTs and notes travel with them.
summary: An hour of UHD ProRes 422 HQ is about 318 GB. A two-step handover with proxies first, originals overnight, and a folder the editor can relink from.
answer: To send 4K footage to a remote editor, upload proxies, sound and LUTs first so they can start cutting, then send the camera originals overnight in the same folder structure through a transfer that resumes. An hour of UHD ProRes 422 HQ at 24 fps is about 318 GB, which takes 14 h 8 min to upload at 50 Mbps at full speed.
section: sizes
order: 23
updated: 2026-10-09
related:
  - { href: /for/editors, label: For editors }
  - { href: /for/videographers, label: For videographers }
  - {
      href: /guides/send-large-video-files-to-an-editor,
      label: Send large video files to an editor,
    }
  - { href: /guides/send-300gb-of-video-footage, label: Send 300 GB of video footage }
  - { href: /features/folders, label: Send whole folders }
faq:
  - q: How big is 4K footage per hour?
    a: Apple's ProRes white paper puts UHD 4K at 24 fps at about 65 GB an hour in ProRes 422 Proxy, 212 GB in ProRes 422 and 318 GB in ProRes 422 HQ. Camera RAW varies by camera and setting.
  - q: Should I send my editor proxies or originals?
    a: Proxies first, originals after. Proxies are about a fifth of the size of ProRes 422 HQ, so the editor can start the next morning while the originals keep uploading.
  - q: Which Tranzfer plan fits a day of 4K?
    a: Two hours of UHD ProRes 422 HQ is about 636 GB, plus proxies. That fits Pro, which holds 1 TB live at once for $29 a month. Bigger shoots fit Studio, which holds 3 TB.
  - q: Can my editor give feedback on the footage in Tranzfer?
    a: No. Tranzfer has no playback, previews or comments. Use a review tool for cuts and Tranzfer for moving the files.
---

## How much 4K are you sending?

Work out hours of footage, then multiply. These are Apple's figures for UHD at 24 fps from the [ProRes white paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf), with the upload time for one hour of footage at full speed.

| UHD 4K, 24 fps   | Size per hour | Upload at 50 Mbps | Upload at 100 Mbps |
| ---------------- | ------------- | ----------------- | ------------------ |
| ProRes 422 Proxy | 65 GB         | 2 h 53 min        | 1 h 27 min         |
| ProRes 422       | 212 GB        | 9 h 25 min        | 4 h 43 min         |
| ProRes 422 HQ    | 318 GB        | 14 h 8 min        | 7 h 4 min          |

Real uploads hold about 80% of the line, so add a quarter. Two hours recorded in 422 HQ is 636 GB, which is 28 h 16 min at 50 Mbps at full speed. That's more than a night. Plan the handover around it.

## What should the folder look like?

Build it once, the way the editor will open it, and send that same folder every time.

```
Project_Shoot/
  Day1/
    A-cam/A001/
    B-cam/B001/
    Sound/
  Proxies/Day1/A-cam/A001/
  LUTs/
  Notes.txt
```

- **Leave the camera cards as they came off.** Sidecar files and metadata sit next to the clips, and editing apps read the card as a whole.
- **Give proxies the same file names as the originals.** Only the folder differs. When the originals land, the editor relinks in one pass.
- **Send the sound rolls with the sound report.** Dual-system audio syncs by timecode, and the report tells the editor which takes were good.
- **Include the LUT the DP monitored with.** It is usually a `.cube` file. Sending it means the editor sees what was shot, not flat log.
- **Write a short notes file.** Frame rate, the color space, which takes the director liked, anything odd on set.

Tranzfer keeps the folder structure exactly as you send it, so the paths on the editor's drive match yours.

## What's the two-night schedule?

1. **Wrap evening.** Make proxies, then send `Proxies`, `Sound`, `LUTs` and `Notes.txt` as the first delivery. Two hours of UHD proxies is about 130 GB, or 5 h 47 min at 50 Mbps at full speed. The editor starts in the morning.
2. **Next day and night.** Send the camera originals as a second delivery. Plug in, turn off sleep, pause cloud backups and leave it.
3. **When it lands.** The editor downloads the originals into the same project folder and relinks.

On Pro, 130 GB of proxies plus 636 GB of originals is 766 GB, inside the 1 TB it holds live at once. Links last up to 14 days, which covers an edit that runs into the second week. For longer shoots, check the totals in the [upload time calculator](/tools/upload-time-calculator) before you promise a date.

## What if the overnight upload breaks?

You'll find out at 7 am. On Tranzfer, a Wi-Fi drop retries by itself and a sleeping laptop carries on when it wakes. After a crash or a closed tab, open Tranzfer and pick the same folder. Only the missing parts upload. It checks each file matches what already arrived, so a re-exported clip with the same name gets refused instead of mixed in.

It can't upload from a sleeping laptop. Resume saves the work, not the hours.

## What does the editor see?

One link per delivery. No account and nothing to install. On desktop Chrome or Edge, Download all asks for a folder once, saves everything with its subfolders, and carries on if the download is interrupted. Point it at the project folder and the relink paths line up. Other browsers download file by file. There's more on that end in the [page for editors](/for/editors).

## When should you use something else?

- **The editor wants to review cuts with the director.** We have no playback or comments. [Frame.io](https://frame.io/) is built for frame-accurate feedback. Its V4 [doesn't support DaVinci Resolve](https://help.frame.io/en/articles/9893008-what-to-expect-when-updating-to-v4-a-comprehensive-guide-for-enterprise-customers), so check what your editor cuts in.
- **Clients or crew upload to you.** We don't have request links. MASV's portals take uploads and can [forward them to Frame.io or S3](https://help.massive.io/en/how-to-use-a-portal-to-send-files-to-integrations).
- **You shoot for a week on a slow line.** Two terabytes at 20 Mbps is over 9 days of uploading at full speed. Send proxies online and ship the originals on a drive.

The general version of this, for any footage, is in [how to send large video files to an editor](/guides/send-large-video-files-to-an-editor).

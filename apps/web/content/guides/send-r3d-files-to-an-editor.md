---
title: How to send R3D files to an editor
description: "How to send R3D files to an editor: copy the whole RDM folder, keep the 4 GB segments together, and plan the upload with RED's own REDCODE data rates."
summary: Send the whole RDM folder, never loose .R3D files. RED's data rates for V-RAPTOR [X] and KOMODO-X, and what that means for upload time.
answer: To send R3D files to an editor, send the whole .RDM folder from each card, exactly as the camera wrote it, through a transfer that resumes, and send your editor the link. Never pull single .R3D files out. A long clip is split into several segments that only open as one clip when they stay together in their .RDC folder.
section: formats
order: 32
updated: 2026-10-09
related:
  - { href: /guides/send-braw-footage, label: Send BRAW footage }
  - { href: /guides/send-prores-files, label: Send ProRes files }
  - { href: /guides/send-large-video-files-to-an-editor, label: Send video files to an editor }
  - { href: /features/folders, label: Send whole folders }
  - { href: /for/editors, label: For editors }
faq:
  - q: Why does one RED clip show up as several R3D files?
    a: RED splits long clips into 4 GB segments inside the clip's .RDC folder. Apps that read R3D string them back into one continuous clip, as long as the segments stay together.
  - q: What is an RMD file?
    a: A metadata file that sits next to the R3D files in the .RDC folder. REDCINE-X PRO creates one when you open a clip and change its settings. Send it with the clip so your editor sees the same look.
  - q: How big is an hour of 8K R3D?
    a: RED lists V-RAPTOR [X] 8K 17:9 at 24 fps as 425 MB/s on HQ and 100 MB/s on ELQ. That's about 1.5 TB and 360 GB an hour.
  - q: Can I zip the RDM folder?
    a: You can, but there's no need. Footage is already compressed, so the zip barely shrinks it, and Tranzfer sends the folder as it is with every subfolder in place.
---

## What's on a RED card?

A folder tree, not a pile of clips. RED's [REDCINE-X PRO guide](https://docs.red.com/955-0004_v50/REDCINE-XProOperationGuide/Content/4_LoadOrganize/R3D_Structure.htm) lays it out:

- **The .RDM folder** is the card, or reel.
- **One .RDC folder per clip** sits inside it. RED names them by camera letter, reel, clip number, month, day and two random characters, so a card looks like `A001_C001_05026M.RDC`, `A001_C002_0502CE.RDC` ([clip naming](https://docs.red.com/955-0047/MediaOperationGuide/Content/5_Eject_And_Format_Media/Clip_Naming_Convention.htm)).
- **The .R3D files** inside each .RDC are the footage. RED's [media guide](https://docs.red.com/955-0047/MediaOperationGuide/Content/6_Offload_Media/Offload_Data_From_Media_to_Your_Computer.htm) says longer clips are broken into 4 GB segments grouped in the .RDC folder, and apps that read R3D join them back into one clip.
- **The .RMD file** holds metadata. REDCINE-X PRO creates it when you open a clip and change it.

Some cameras also write a .mov or .mxf next to the R3Ds. The REDCINE-X PRO guide lists both, depending on the camera.

The rule follows from the layout. If one segment goes missing, the clip is short. If the RMD is left behind, the look is gone. Send the .RDM folder whole.

## How big are R3D files?

RED publishes data rates per quality setting in each camera's operation guide. These are for the [V-RAPTOR [X] 8K VV](https://docs.red.com/955-0225/955-0225_V2.0+Rev-A+RED+PS,+V-RAPTOR+%5BX%5D+8K+VV+Operation+Guide/Content/4_Menus/b_ProjSet/R3D_Quality.htm) at 24 fps. Our GB-an-hour column is RED's MB/s times 3,600.

| R3D quality | 8K 17:9              | 6K 17:9            |
| ----------- | -------------------- | ------------------ |
| HQ          | 425 MB/s, 1,530 GB/h | 239 MB/s, 860 GB/h |
| MQ          | 298 MB/s, 1,073 GB/h | 168 MB/s, 605 GB/h |
| LQ          | 186 MB/s, 670 GB/h   | 105 MB/s, 378 GB/h |
| ELQ         | 100 MB/s, 360 GB/h   | 65 MB/s, 234 GB/h  |

The [KOMODO-X guide](https://docs.red.com/955-0219/955-0219_V2.0+Rev-A+RED+PS,+KOMODO-X+Operation+Guide/Content/4_Menus/02_ProjSet/R3D_Quality.htm) lists the same 6K 17:9 numbers. MQ is the default. RED recommends HQ for VFX and stills from motion, MQ for cinema and high-end TV, and LQ for TV, online content, documentary and interviews. These are 24 fps figures. For other frame rates, check the guide for your camera.

## How long will the upload take?

An hour of 8K MQ is about 1,073 GB. On a 100 Mbps upload that's almost 24 hours at full speed and about 30 hours at 80 percent. An hour of 6K LQ, 378 GB, is about 10 and a half hours on the same line at 80 percent. On a 500 Mbps office line, divide by five. Run your own numbers in the [upload time calculator](/tools/upload-time-calculator).

Nothing stays stable for a day. That's the case for a tool that resumes. On Tranzfer a dropped connection retries by itself and a sleeping laptop carries on when it wakes. After a browser crash or a closed tab, pick the same folders again and only the missing parts upload. Tranzfer checks each file matches what already arrived and refuses a different file with the same name.

## How do I prepare R3D files for an editor?

1. **Copy the .RDM folder.** RED's media guide says copying it takes all the media and metadata files. You don't need the log, magazine profile or presets files.
2. **Verify the copy** with a tool that checks checksums.
3. **Sort by day and camera.** `Day1/A-cam/A001_xxxx.RDM`, `Day1/B-cam/B001_xxxx.RDM`, `Day1/Sound`. Leave everything inside each .RDM alone.
4. **Save your look.** If you set looks in REDCINE-X PRO, the .RMD files carry them. Include any LUTs and a short note on the camera, format and quality setting.
5. **Check your editor can open R3D.** RED says R3D opens in REDCINE-X PRO or in editing software that supports the [RED SDK](https://docs.red.com/955-0225/955-0225_V2.0+Rev-A+RED+PS,+V-RAPTOR+%5BX%5D+8K+VV+Operation+Guide/Content/4_Menus/b_ProjSet/Proj_Format.htm). If they can't, transcode first and send both.

## How do I send it with Tranzfer?

Sign in with Google, drag the shoot folder in, and pick how long the link lasts. The RDM, RDC and segment structure arrives exactly as you sent it. Your editor opens the link with no account. On desktop Chrome or Edge, Download all saves the whole delivery into one folder with its subfolders and picks up again if the download breaks. Other browsers download file by file, which is painful with hundreds of segments, so point your editor at Chrome or Edge.

Free holds 20 GB live at once, Starter 300 GB, Pro 1 TB and Studio 3 TB. Three hours of 8K MQ is over 3 TB, past our biggest plan. See [pricing](/pricing).

## When should you use something else?

- **More than 3 TB in one go.** Split it by day, or ship a drive.
- **You need playback, review or comments.** Tranzfer has none of those.
- **You want a desktop app or accelerated UDP transfer.** We don't have either. [MASV](https://masv.io/pricing) has a desktop app and charges $0.25 per GB after the first 15 GB a month.
- **The files need to stay up for months.** Our links last 14 days at most, then the files are deleted.

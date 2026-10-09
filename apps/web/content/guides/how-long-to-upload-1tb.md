---
title: How long does it take to upload 1 TB?
description: How long it takes to upload 1 TB at 10 Mbps to 1 Gbps, the speed you need to finish by a deadline, and when a drive in the post beats the internet.
summary: About 22 hours at 100 Mbps and almost two days at 50 Mbps, at full speed. The speed a deadline needs, and when shipping a drive wins.
answer: Uploading 1 TB takes about 22 h 13 min at 100 Mbps, 44 h 27 min at 50 Mbps and 4 h 27 min at 500 Mbps, if your connection holds full upload speed the whole time. Real uploads run slower, so plan on a quarter longer, and at 20 Mbps or less think about shipping a drive.
section: sizes
order: 25
updated: 2026-10-09
related:
  - { href: /guides/transfer-1tb-of-files, label: How to transfer 1 TB of files }
  - { href: /guides/how-long-to-upload-500gb, label: How long to upload 500 GB }
  - { href: /guides/how-long-to-upload-100-gb, label: How long to upload 100 GB }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
  - { href: /for/studios, label: For studios & agencies }
faq:
  - q: Can you upload 1 TB in a day?
    a: You need about 93 Mbps of upload held for 24 hours, or about 116 Mbps if you plan on 80% of your line. Below that, it spills into a second day.
  - q: Is 1 TB the same as 1 TiB?
    a: No. A TiB is about 10% bigger, roughly 1,100 GB. Windows Explorer shows TiB and GiB but labels them TB and GB, so a folder it calls 1 TB is about 1.1 TB to a transfer service.
  - q: Which Tranzfer plan holds 1 TB?
    a: Pro, at $29 a month, holds exactly 1 TB live at once. Anything over that needs Studio, at $69 a month for 3 TB, or splitting it into smaller deliveries.
  - q: Does a 1 TB upload count against a data cap?
    a: It counts against your internet plan's monthly cap if your plan has one. Check before you start, because a terabyte up and a terabyte down on the other end are both real traffic.
---

## 1 TB at common upload speeds

A terabyte is 8,000,000 megabits. Divide by your upload speed and you get the full-speed column. The 80% column allows for the dips every real upload has. For other sizes, the [upload time calculator](/tools/upload-time-calculator) runs the same math.

| Upload speed | At full speed | At 80%       | MB per second |
| ------------ | ------------- | ------------ | ------------- |
| 10 Mbps      | 9 days 6 h    | 11 days 14 h | 1.25 MB/s     |
| 20 Mbps      | 4 days 15 h   | 5 days 19 h  | 2.5 MB/s      |
| 50 Mbps      | 44 h 27 min   | 2 days 8 h   | 6.25 MB/s     |
| 100 Mbps     | 22 h 13 min   | 27 h 47 min  | 12.5 MB/s     |
| 200 Mbps     | 11 h 7 min    | 13 h 53 min  | 25 MB/s       |
| 500 Mbps     | 4 h 27 min    | 5 h 33 min   | 62.5 MB/s     |
| 1 Gbps       | 2 h 13 min    | 2 h 47 min   | 125 MB/s      |

Double the [500 GB figures](/guides/how-long-to-upload-500gb) and ten times the [100 GB ones](/guides/how-long-to-upload-100-gb). Under 100 Mbps, a terabyte is not an overnight job. It's a weekend.

## How fast does my line need to be?

Work back from when it has to arrive.

| Finish within      | At full speed | At 80%   |
| ------------------ | ------------- | -------- |
| 8 hours, overnight | 278 Mbps      | 347 Mbps |
| 24 hours           | 93 Mbps       | 116 Mbps |
| 48 hours           | 46 Mbps       | 58 Mbps  |
| 72 hours           | 31 Mbps       | 39 Mbps  |

Run a speed test from the computer doing the upload and read the upload number, not the download. If you're below the 72-hour row, plan for a drive, or for sending the part that's needed first and the rest later.

## Is it really 1 TB?

Check before you pick a plan. A "1 TB" drive holds 1,000,000,000,000 bytes, which Windows shows as 931 GB because it counts in GiB. Go the other way and a folder Windows calls 1 TB is really about 1.1 TB. Those extra 100 GB add about 4 h 25 min at 50 Mbps. Transfer services, and our plans, count in GB and TB.

## What stretches a two-day upload?

On something this long, you will hit every interruption a computer has. Laptops sleep on battery. Updates install overnight and restart. Routers drop for a minute. Someone closes the lid to move the laptop. On a tool that starts over, any one of those on day two costs you day one as well.

On Tranzfer, a drop retries by itself and a sleeping laptop carries on after it wakes. After a crash, a reboot or a closed tab, open Tranzfer, pick the same files, and only the missing parts upload. It checks that what you picked matches what already arrived. A sleeping laptop still uploads nothing, so resume saves the work, not the hours.

Our release test pushes 100 GiB through eight forced failures, including a browser crash and a 20-minute freeze, and finishes in 56 minutes on a data-centre machine at about 620 Mbps. We haven't put a full terabyte through that test. We're new, and that's the honest limit of what we've measured.

## What about the download?

The recipient's speed decides that. At 500 Mbps down, a terabyte takes 4 h 27 min. They also need a terabyte of free disk. On desktop Chrome or Edge, Download all asks for a folder once, saves everything with its subfolders, and carries on if interrupted. Other browsers download file by file.

## When should you use something else?

- **Your upload is 20 Mbps or less.** At 20 Mbps you're looking at nearly five days. A drive by courier is faster and nothing can drop.
- **You're filling Google Drive.** Google's Workspace help says each user can upload [750 GB in 24 hours](https://knowledge.workspace.google.com/admin/drive/storage-and-upload-limits-for-google-workspace), so 1 TB takes two days there whatever your speed.
- **It's a fixed pipeline between companies.** [IBM Aspera](https://www.ibm.com/products/aspera) and [Signiant](https://www.signiant.com/) fit that job better. IBM says Aspera moves data over its own FASP protocol instead of plain TCP and deploys on premises or on cloud object storage. Signiant sells Media Shuttle and Jet to media companies. Tranzfer has no accelerated UDP transfer.

For how to plan the upload itself, one delivery or four, see [how to transfer 1 TB of files](/guides/transfer-1tb-of-files).

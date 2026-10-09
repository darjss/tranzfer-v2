---
title: How to transfer 1 TB of files
description: How to transfer 1 TB of files online. Plan a multi-day upload, or split it into deliveries the recipient downloads as you go, and know when a drive is faster.
summary: A terabyte is a multi-day upload on most home lines. How to plan the days, when to split it into several deliveries, and when to ship a drive instead.
answer: To transfer 1 TB of files online, treat it as a multi-day job on a plan that holds the whole terabyte, or split it into deliveries the recipient downloads while you upload the next. At 50 Mbps, 1 TB takes 44 h 27 min at full speed, and on a 20 Mbps line a hard drive in the post can arrive first.
section: sizes
order: 22
updated: 2026-10-09
related:
  - { href: /guides/how-long-to-upload-1tb, label: How long to upload 1 TB }
  - { href: /guides/send-300gb-of-video-footage, label: Send 300 GB of video footage }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
  - { href: /for/studios, label: For studios & agencies }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
faq:
  - q: Can I upload 1 TB to Google Drive in one go?
    a: Google's Workspace help says each user can upload 750 GB to Drive in 24 hours, and only the file that crosses that line finishes. A full terabyte needs at least two days there.
  - q: Which Tranzfer plan holds 1 TB?
    a: Pro, at $29 a month, holds 1 TB live at once. If your folder is even slightly over, Studio at $69 holds 3 TB. On Starter you can still send a terabyte as four smaller deliveries.
  - q: Is it faster to ship a hard drive?
    a: On a slow line, often. At 20 Mbps a terabyte takes 4 days 15 h at full speed. A courier that delivers next day beats that easily.
  - q: Does the computer have to stay on the whole time?
    a: Yes, while the upload runs. A sleeping laptop uploads nothing. Tranzfer picks up where it stopped when the laptop wakes, so you lose time, not progress.
---

## How many nights will 1 TB take?

Start with your upload speed, then count in nights, not hours. The left half is the whole terabyte. The right half is how much moves in one 8-hour night at 80% of your line speed, which is what a long upload tends to hold.

| Upload speed | 1 TB at full speed | 1 TB at 80% | Per 8-hour night at 80% |
| ------------ | ------------------ | ----------- | ----------------------- |
| 20 Mbps      | 4 days 15 h        | 5 days 19 h | 58 GB                   |
| 50 Mbps      | 44 h 27 min        | 2 days 8 h  | 144 GB                  |
| 100 Mbps     | 22 h 13 min        | 27 h 47 min | 288 GB                  |
| 500 Mbps     | 4 h 27 min         | 5 h 33 min  | 1,440 GB                |
| 1 Gbps       | 2 h 13 min         | 2 h 47 min  | 2,880 GB                |

At 100 Mbps, a terabyte runs through a night and the whole next day. At 50 Mbps, it's a weekend. The [1 TB upload time guide](/guides/how-long-to-upload-1tb) breaks this down further, and the [calculator](/tools/upload-time-calculator) takes your exact speed.

## One big delivery, or several smaller ones?

**One delivery on Pro.** Pro is $29 a month and holds 1 TB live at once. You pick the whole folder, it uploads across as many days as it needs, and the recipient gets one link with everything in it. Links last up to 14 days. The downside is that nobody can start until the last byte lands.

Check the size first. A terabyte is 931 GiB, and Windows Explorer shows GiB with a GB label. If Explorer says the folder is 940 GB, it's really about 1,009 GB and won't fit in Pro. Studio, at $69 a month, holds 3 TB.

**Several deliveries.** Split the folder along a line that means something to the recipient, like shoot days, cameras or chapters. Send the first part, and while they download it, upload the next. They start work after the first night instead of the third. At 50 Mbps, a 250 GB part takes 11 h 7 min at full speed.

This also works on Starter, which holds 300 GB live at once for $15 a month. Space frees up when a link expires or you cancel it. So send a part, cancel its link once the recipient confirms the download, and send the next. Four rounds move a terabyte. It's cheaper and needs more back and forth.

## How do I keep a multi-day upload going?

1. **Use a desktop or a laptop on power.** Turn off sleep in the power settings. A sleeping laptop uploads nothing.
2. **Plug in ethernet.** Over two days, Wi-Fi dips add up.
3. **Pause cloud backups and photo sync** until it's done. They share the same upload.
4. **Don't run a second big upload alongside.** Two at once each get half.
5. **Check in each morning** and see how far it got against the table above.

## What if it breaks on day two?

It probably will, once or twice. On Tranzfer, a dropped connection retries by itself and a sleeping laptop carries on when it wakes. If the browser crashes, an update restarts the machine, or someone closes the tab, open Tranzfer, pick the same folder, and only the missing parts upload. It checks the files you picked match what already arrived and refuses a different file with the same name.

We test this on a 100 GB upload with eight failures forced on purpose, including a crash and a 20-minute freeze. We haven't run a terabyte under the same test, and we're new, so weigh that.

## What does the recipient need?

A terabyte of free disk, and time on their end too. On desktop Chrome or Edge, Download all asks for a folder once, saves the whole delivery into it with its subfolders, and carries on if the download is interrupted. Other browsers download file by file, which gets old fast across thousands of files. Point them at desktop Chrome or Edge.

## When should you use something else?

- **Your line is slow and the package is bigger.** At 20 Mbps, ship a drive. Two terabytes would take over 9 days to upload at full speed.
- **It's a standing enterprise pipeline.** [IBM Aspera](https://www.ibm.com/products/aspera) runs its own FASP transport, which IBM calls "a fundamental rewrite of the transport layer", and deploys on premises or on cloud storage. [Signiant](https://www.signiant.com/) sells Media Shuttle and Jet to media companies. Both fit fixed routes between companies better than a link per delivery.
- **You want an installed client.** MASV's desktop app [recovers from reboots](https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload) and [Filemail's](https://www.filemail.com/apps/desktop) resumes too. We're browser only.
- **It's going into Google Drive anyway.** Plan around the [750 GB a day limit](https://knowledge.workspace.google.com/admin/drive/storage-and-upload-limits-for-google-workspace) on Workspace accounts. And for Dropbox, its own page says browser uploads [over 375 GB may time out](https://help.dropbox.com/sync/upload-limitations).

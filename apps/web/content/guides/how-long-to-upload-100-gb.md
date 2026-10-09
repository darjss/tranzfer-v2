---
title: How long does it take to upload 100 GB?
description: How long it takes to upload 100 GB at 10 Mbps to 1 Gbps, why real uploads run slower than the math, and how to make a big upload finish sooner.
summary: About 4 hours 27 minutes at 50 Mbps and 2 hours 13 minutes at 100 Mbps, at full speed. What slows it down and how to plan.
answer: Uploading 100 GB takes about 4 h 27 min at 50 Mbps, 2 h 13 min at 100 Mbps and 26 min 40 s at 500 Mbps, if your connection holds its full upload speed the whole way. Real uploads run slower, so plan for about a quarter longer.
section: sizes
order: 6
updated: 2026-10-09
related:
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
  - { href: /features/resume, label: Resume anything }
  - { href: /features/send-large-files, label: Send huge files }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
faq:
  - q: How long does 100 GB take on gigabit internet?
    a: 13 min 20 s at a full gigabit. In practice, plan for 16 min 40 s or more, because few uploads hold the full line speed for long.
  - q: How long does it take to upload 1 TB?
    a: 22 h 13 min at 100 Mbps with the line flat out, and 44 h 27 min at 50 Mbps. A terabyte is an overnight job on almost any home connection, so use a tool that resumes.
  - q: What's the difference between Mbps and MB/s?
    a: Divide by 8. Internet speeds are in megabits per second (Mbps); file sizes are in megabytes (MB). 100 Mbps moves 12.5 MB a second.
  - q: Does the download take as long as the upload?
    a: The recipient's download speed decides that, not yours. Home connections usually download several times faster than they upload, so the download is often the short part.
---

## 100 GB at common upload speeds

The first column is the math: 100 GB is 800,000 megabits, divided by your speed. The second assumes the upload holds 80% of that speed, which is a safer number to plan around. For any other size, use the [upload time calculator](/tools/upload-time-calculator).

| Upload speed | At full speed | At 80%      | MB per second |
| ------------ | ------------- | ----------- | ------------- |
| 10 Mbps      | 22 h 13 min   | 27 h 47 min | 1.25 MB/s     |
| 20 Mbps      | 11 h 7 min    | 13 h 53 min | 2.5 MB/s      |
| 50 Mbps      | 4 h 27 min    | 5 h 33 min  | 6.25 MB/s     |
| 100 Mbps     | 2 h 13 min    | 2 h 47 min  | 12.5 MB/s     |
| 200 Mbps     | 1 h 7 min     | 1 h 23 min  | 25 MB/s       |
| 500 Mbps     | 26 min 40 s   | 33 min 20 s | 62.5 MB/s     |
| 1 Gbps       | 13 min 20 s   | 16 min 40 s | 125 MB/s      |

## What's my upload speed?

Run a speed test, like [Cloudflare's](https://speed.cloudflare.com) or [fast.com](https://fast.com), from the computer you'll upload from, on the same Wi-Fi or cable. Use the upload number, not the download. On cable and DSL plans the upload is often a small fraction of the download: a plan sold as 300 Mbps might upload at 20.

## Why does a real upload take longer than the math?

- **Overhead.** Every request carries headers, encryption and acknowledgements on top of your file. It's a few percent, but it never goes away.
- **Wi-Fi.** Walls, distance and the neighbours' networks all cut into the speed your laptop gets. A speed test next to the router flatters you.
- **Everything else on the line.** Cloud backups, photo sync, a video call in the next room. They share the same upload.
- **The service.** Some upload one piece at a time, so each pause between pieces is wasted time. Some put free accounts in a slower queue.
- **Interruptions.** On a long upload something will happen. A tool that starts over can turn a 4-hour upload into an 8-hour one.

## What did we measure?

Our release test uploads 100 GiB (about 107 GB) from a browser while breaking it on purpose eight times: offline for 90 seconds, a rejected part, a reload, a closed tab, a 20-minute freeze, a browser crash, a wrong file picked, and a lost final response. It finished in 56 minutes, freeze included, with the file matching byte for byte.

Between failures it ran at 74 to 75 MiB/s, about 620 Mbps. That ran on a data-centre machine, not a home connection, so read it as what the uploader can do, not what your Wi-Fi will. Sending four parts at once instead of one took a 10 GiB test with the same failures from 14.8 to 43.1 MiB/s.

## How do I make a big upload finish sooner?

1. Plug in an ethernet cable if you can. It beats Wi-Fi almost every time.
2. Pause cloud backups and sync apps until the upload is done.
3. Run one big upload at a time. Two at once each get half.
4. Keep the computer awake. On a Mac, plug in power and stop it sleeping in Battery settings. Resuming saves the work, not the time; a sleeping laptop uploads nothing.
5. Use a tool that keeps what arrived. With Tranzfer, a drop or a crash costs you the parts in flight, not the hours before them. Start it before bed and check in the morning.

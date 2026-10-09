---
title: How long does it take to upload 500 GB?
description: How long it takes to upload 500 GB at 10 Mbps to 1 Gbps, the speed you need to finish overnight, and what stretches a long upload past the math.
summary: About 22 hours at 50 Mbps and 11 hours at 100 Mbps, at full speed. The speed you need to finish overnight, and what slows a day-long upload.
answer: Uploading 500 GB takes about 22 h 13 min at 50 Mbps, 11 h 7 min at 100 Mbps and 2 h 13 min at 500 Mbps, if your connection holds its full upload speed the whole time. Real uploads run slower, so plan on a quarter longer, which turns 50 Mbps into 27 h 47 min.
section: sizes
order: 24
updated: 2026-10-09
related:
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
  - { href: /guides/how-long-to-upload-100-gb, label: How long to upload 100 GB }
  - { href: /guides/how-long-to-upload-1tb, label: How long to upload 1 TB }
  - { href: /guides/transfer-1tb-of-files, label: Transfer 1 TB of files }
  - { href: /features/resume, label: Resume anything }
faq:
  - q: Can I upload 500 GB overnight?
    a: Only on a fast line. To move 500 GB in 8 hours you need about 139 Mbps of upload at full speed, or about 174 Mbps if you plan on 80%. Most cable and DSL uploads are well below that.
  - q: How long does 500 GB take on gigabit?
    a: 1 h 7 min at a full gigabit, and about 1 h 23 min at 80%. Gigabit fibre with a symmetric upload is the one home connection where 500 GB is a lunch break.
  - q: Which Tranzfer plan holds 500 GB?
    a: Pro, at $29 a month, holds 1 TB live at once. Starter holds 300 GB, so on Starter you'd send 500 GB as two deliveries, one after the other.
  - q: How many GB is 500 GB in Windows?
    a: About 466. Windows Explorer counts in GiB and labels it GB, so the same files look about 7% smaller there than a transfer service counts them.
---

## 500 GB at common upload speeds

500 GB is 4,000,000 megabits. Divide that by your upload speed and you get the full-speed column. The 80% column is the one to plan a day around. The [upload time calculator](/tools/upload-time-calculator) does any other size or speed.

| Upload speed | At full speed | At 80%      | MB per second |
| ------------ | ------------- | ----------- | ------------- |
| 10 Mbps      | 4 days 15 h   | 5 days 19 h | 1.25 MB/s     |
| 20 Mbps      | 2 days 8 h    | 2 days 21 h | 2.5 MB/s      |
| 50 Mbps      | 22 h 13 min   | 27 h 47 min | 6.25 MB/s     |
| 100 Mbps     | 11 h 7 min    | 13 h 53 min | 12.5 MB/s     |
| 200 Mbps     | 5 h 33 min    | 6 h 57 min  | 25 MB/s       |
| 500 Mbps     | 2 h 13 min    | 2 h 47 min  | 62.5 MB/s     |
| 1 Gbps       | 1 h 7 min     | 1 h 23 min  | 125 MB/s      |

Five times the [100 GB times](/guides/how-long-to-upload-100-gb), which sounds obvious until you notice what it means. At 50 Mbps, 100 GB is an afternoon. 500 GB is a full day and night.

## What speed do I need to finish in time?

Turn it around and start from the deadline.

| Finish within       | At full speed | At 80%   |
| ------------------- | ------------- | -------- |
| 8 hours, overnight  | 139 Mbps      | 174 Mbps |
| 24 hours            | 46 Mbps       | 58 Mbps  |
| 48 hours, a weekend | 23 Mbps       | 29 Mbps  |

Find your real upload number with a speed test from the machine that will do the upload, over the same Wi-Fi or cable. Ignore the download figure on your bill. Plenty of plans sold as several hundred megabits upload at 20 to 50.

## Why does a day-long upload run behind the math?

Over two hours, the network is what slows you down. Over twenty, it's everything else on the computer.

- **The machine sleeps.** Laptops on battery sleep, and a sleeping laptop uploads nothing.
- **Updates restart it.** Overnight is when operating systems like to install and reboot.
- **Backups wake up.** Cloud backup and photo sync apps run on a schedule and share your upload while they do.
- **Wi-Fi drifts.** A speed test next to the router at noon tells you little about 3 am from the bedroom.
- **Breaks cost more.** On a tool that starts over, losing the connection at hour 18 costs 18 hours, not a few minutes.

## What did we measure?

Our release test uploads 100 GiB (about 107 GB) from a browser and breaks it on purpose eight times, with a crash, a closed tab, a reload, a 20-minute freeze and more. It finished in 56 minutes, freeze included, and the file matched byte for byte. Between failures it ran at about 620 Mbps.

That was a data-centre machine. At home your line is the limit, not the uploader. It does show that a break costs the parts in flight and nothing earlier. We haven't run 500 GB through the same test.

## How do I get 500 GB up sooner?

1. **Use ethernet.** It's the one change that reliably adds speed.
2. **Stop the machine sleeping** and keep it on power. Resume saves the work, not the time.
3. **Pause backups and sync** until the upload's done, and postpone system updates.
4. **Send one thing at a time.** Two uploads each get half the line.
5. **Pick a tool that keeps what arrived.** On Tranzfer, a Wi-Fi drop retries by itself, sleep carries on after waking, and after a crash you pick the same files and only the missing parts go up. On Pro, 500 GB fits in one delivery with 500 GB to spare.
6. **Send something first.** If the other side needs to start before the whole lot lands, send the part they need first as its own delivery.

## Does the download take as long?

Not usually. The recipient's download speed decides it, and home lines download faster than they upload. At 500 Mbps down, 500 GB takes 2 h 13 min. On desktop Chrome or Edge, Download all saves the whole delivery into one folder and carries on if it's interrupted. Other browsers go file by file.

## When should you use something else?

- **Your upload is under 20 Mbps.** That's over two days of uploading. A drive sent by courier is faster.
- **You want an installed client.** We're browser only. MASV's desktop app [recovers from reboots](https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload) and [Filemail's desktop app](https://www.filemail.com/apps/desktop) resumes too.
- **You were going to use Dropbox in the browser.** Dropbox's own page says browser uploads [over 375 GB may time out](https://help.dropbox.com/sync/upload-limitations) and points you to its desktop app.

If 500 GB is half of what you have, [how long it takes to upload 1 TB](/guides/how-long-to-upload-1tb) and [how to transfer 1 TB of files](/guides/transfer-1tb-of-files) cover the planning.

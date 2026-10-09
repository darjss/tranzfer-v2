---
title: Google Drive upload keeps failing on a large file? Here's why
description: Google Drive upload keeps failing on a large file? The 750 GB daily limit, full storage, Drive for desktop retries and Lost and Found, and what to do.
summary: The 750 GB daily cap, full storage, and a browser tab Google never documents. How to tell which one it is and fix it.
answer: When a Google Drive upload keeps failing on a large file, it's usually one of four things, the 750 GB daily upload limit, storage that's full, a browser tab that lost the upload, or Drive for desktop waiting to retry. Check storage first, then the daily limit, then move big batches to Drive for desktop.
section: problems
order: 11
updated: 2026-10-09
related:
  - { href: /alternatives/google-drive, label: Google Drive alternatives }
  - { href: /guides/resume-an-interrupted-upload, label: Resume an interrupted upload }
  - { href: /guides/dropbox-upload-stuck, label: Dropbox upload stuck }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
faq:
  - q: What is the Google Drive daily upload limit?
    a: Google's Workspace admin help says each user can upload and copy 750 GB to Drive within 24 hours, and the limit refreshes within 24 hours. The consumer Drive help only says there is a daily upload limit and gives no number.
  - q: What is the largest file Google Drive accepts?
    a: 5 TB per file, according to Google's Drive help.
  - q: Does Google Drive resume an upload in the browser?
    a: Google doesn't say. The Drive API supports resumable uploads, but no help page describes what drive.google.com does after a closed tab or a dropped connection. Plan as if a closed tab loses the upload.
  - q: Where do failed Drive for desktop uploads go?
    a: If Drive for desktop can't upload a file, it copies it to a Lost and Found folder on your computer and shows a notification. Move the files back into My Drive to retry. Disconnecting your account deletes that folder's contents.
---

## Why does a large upload to Google Drive keep failing?

Each cause leaves a different trace, so start by matching what you see.

| Cause                   | What it looks like                                         | Google's page                                                                                                                |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Daily upload limit      | One big file finishes, everything after it fails for a day | [Workspace upload limits](https://knowledge.workspace.google.com/admin/drive/storage-and-upload-limits-for-google-workspace) |
| Storage full            | Uploads stop, Drive for desktop says storage is full       | [Google One storage](https://support.google.com/googleone/answer/9312312)                                                    |
| File over 5 TB          | The upload is refused outright                             | [Drive file limits](https://support.google.com/drive/answer/37603)                                                           |
| Browser tab interrupted | The upload vanishes after sleep, a reload or a drop        | Not documented                                                                                                               |
| Drive for desktop error | A Lost and Found notification, or sync that never finishes | [Fix problems in Drive for desktop](https://support.google.com/drive/answer/2565956)                                         |

## What does the 750 GB daily limit do?

On Google Workspace, each user can upload and copy 750 GB to Drive within 24 hours. The interesting line is what happens at the edge. Google's admin help says "Only the first file that breaks the limit completes uploading." So if you upload 600 GB and then a 200 GB file, that file finishes, and every upload after it fails until the limit refreshes, which Google says happens within 24 hours. Read literally, a single file bigger than 750 GB can still finish if it's the first one over.

Personal accounts are vaguer. The consumer help page says only that "Drive users are subject to a daily upload limit" and gives no number. If you're on a personal account and uploads stop after a few hundred gigabytes, this may be why, but Google doesn't publish the figure.

Copies count too. Google says files larger than 750 GB can't be copied in Drive, so you download and upload them again.

## Is my storage full?

Check this before anything else, because it's the quickest to rule out. A free Google account has 15 GB, shared between Gmail, Drive and Photos. A 20 GB folder won't fit, however good your connection is. Google's [upload help](https://support.google.com/drive/answer/2424368) adds a trap. A file you upload takes up space in your Drive even when you upload it to a folder someone else owns.

Drive for desktop has two more storage problems. It needs enough free space on your own disk to sync. And if you sync changes to a file you don't own, the owner's full storage can block you, which Google says you fix by asking them to transfer ownership or clear space.

## What happens in the browser?

Google doesn't document it. The [Drive API](https://developers.google.com/workspace/drive/api/guides/manage-uploads) supports resumable uploads, so apps built on it can pick up where they stopped. No help page says whether drive.google.com does that after a closed tab, a reload, a sleeping laptop or a network drop. Until Google says otherwise, treat the tab as fragile. Keep it open, keep the laptop awake and on power, and don't upload hundreds of gigabytes through it overnight.

## How do I fix it?

1. **Free up or buy storage** until the whole upload fits, with room to spare.
2. **On Workspace, count today's uploads.** If you've passed 750 GB in 24 hours, wait for the refresh. Retrying sooner just fails again.
3. **Move big batches to Drive for desktop.** When it hits a limit it will automatically retry later. If it doesn't, Google says to wait a day and restart it.
4. **Check Lost and Found.** When Drive for desktop can't upload a file because of permissions or network errors, it copies the file to a Lost and Found folder on your disk and shows a notification. Move those files back into My Drive to retry. Don't disconnect your account first, because Google says that deletes everything in Lost and Found.
5. **Restart Drive for desktop, then the computer.** These are Google's own first steps on its [troubleshooting page](https://support.google.com/drive/answer/2565956).
6. **Give the upload enough time.** 500 GB on a 100 Mbps upload takes 11 hours 7 minutes at full speed, nearer 14 at a realistic 80%. The [upload time calculator](/tools/upload-time-calculator) runs your own numbers.

## When does a transfer tool fit better?

Drive is good at keeping files. It's less good at handing a one-off delivery to someone. Everything you send counts against your storage until you delete it. A shared link works for "anyone who has the link" without signing in, and [link expiry](https://support.google.com/drive/answer/2494822) is only offered on eligible work or school accounts. A file many people download can hit a [download restriction](https://support.google.com/drive/answer/2423534) that Google says typically resets within 24 hours.

Tranzfer is built for the delivery case. You send from the browser, the recipient downloads without an account, and the files are deleted when the link ends. Free holds 20 GB live at once and Studio holds 3 TB. The browser behaviour Google leaves unwritten is the part we test hardest. A dropped connection retries by itself, a sleeping laptop carries on when it wakes, and after a crash or closed tab you pick the same files and only the missing parts upload. [How resume works](/features/resume) has the details, and [resuming an interrupted upload](/guides/resume-an-interrupted-upload) compares what each service says.

## When should you stay with Drive?

- The files need to live somewhere after the handoff. Tranzfer links last 14 days at most and we keep nothing after that.
- Your team already works in shared Drive folders and the recipient has access.
- The file is over 3 TB. Drive takes up to 5 TB per file, and 3 TB live at once is our ceiling.
- You want a desktop app that syncs in the background. Tranzfer runs in the browser only.

If Dropbox is giving you the same trouble, see [Dropbox upload stuck](/guides/dropbox-upload-stuck). For tool choice by file size, start with [how to send large files](/guides/how-to-send-large-files).

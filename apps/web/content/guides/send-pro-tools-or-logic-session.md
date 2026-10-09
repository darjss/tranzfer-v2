---
title: How to send a Pro Tools or Logic session
description: "How to send a Pro Tools session or Logic Pro project to a mixer: collect every audio file, handle plugins, add notes, and send the folder without bouncing or splitting it."
summary: Collect every audio file into the session folder first, then send the whole folder. What to include so your mixer can open it.
answer: To send a Pro Tools session, use Save Copy In with all audio files included and send the whole session folder. To send a Logic project, consolidate it so the audio sits inside the project, then compress the .logicx and send that. Either way, add a note with the sample rate, tempo and plugins.
order: 4
updated: 2026-10-09
related:
  - { href: /for/music, label: For music & audio }
  - { href: /features/folders, label: Send whole folders }
  - { href: /features/resume, label: Resume anything }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
faq:
  - q: My mixer says files are missing. What happened?
    a: Some of the audio lived outside the session folder. In Pro Tools, use File, Save Copy In with All audio files ticked, and send the copy. In Logic, use File, Project Management, Consolidate before you send.
  - q: Will the audio get compressed?
    a: No. A transfer link delivers the WAV and AIFF files exactly as they are, byte for byte. Never send a session through anything that converts audio.
  - q: What if my mixer uses a different DAW?
    a: Stems. Export every track as a full-length audio file starting at the same point, at the session's sample rate and bit depth. Any DAW can line them up.
  - q: How much does it cost to send a session?
    a: Tranzfer Free holds 20 GB at once, which fits a song or an EP. Starter holds 300 GB for $15 a month, enough for an album with every take.
---

## How do I send a Pro Tools session?

A Pro Tools session is a folder. Inside it are the .ptx session file and folders such as Audio Files, Clip Groups, Bounced Files and Session File Backups. The .ptx file on its own is useless to your mixer; it points at audio it doesn't contain.

1. **Collect everything.** If you imported audio without copying it, some of it lives outside the session folder. Choose File, then Save Copy In. Under Items to copy, tick All audio files, and video files if there's picture.
2. **Pick the session format.** The same dialog lets you save for an older version of Pro Tools if your mixer hasn't updated.
3. **Deal with plugins.** If a track's sound depends on a plugin or virtual instrument your mixer may not own, commit or bounce that track and keep the original muted next to it.
4. **Send the copied session folder**, not the one you work in, so nothing changes while it uploads.

## How do I send a Logic project?

1. **Consolidate.** Choose File, then Project Management, then Consolidate. Tick the options to copy audio files and any sampler instruments, Alchemy samples or impulse responses you used. Now the project holds everything it needs.
2. **Check how it's saved.** Logic saves projects as a package by default. That's one .logicx item that's really a folder inside. If yours is saved as a folder instead, send the whole project folder.
3. **Compress the package.** Right-click the .logicx in Finder and choose Compress. Audio barely shrinks, so the zip is about the same size, but a package then travels as one file and opens with a double-click on the other end.
4. **Bounce in place** any track that relies on a third-party plugin your mixer may not have, and keep the original track muted.

## What should I include besides the session?

- A text file with the sample rate, bit depth, tempo, key and the plugins you used.
- A rough mix bounce, so your mixer hears what you hear.
- References, if you have them, in their own folder.
- Stems as a fallback, every track exported from the same start point, full length. If the session won't open, the mix can still start.

## How big is a session?

Smaller than video, bigger than email. Uncompressed audio grows with tracks, length and sample rate:

| Mono track, per minute | Size    | 48 tracks, 4 minutes |
| ---------------------- | ------- | -------------------- |
| 24-bit, 48 kHz         | 8.6 MB  | 1.7 GB               |
| 32-bit float, 48 kHz   | 11.5 MB | 2.2 GB               |
| 24-bit, 96 kHz         | 17.3 MB | 3.3 GB               |

Alternate takes and playlists multiply that. A 12-song album at 24-bit, 48 kHz is around 20 GB before takes, and twice that at 96 kHz. That's past most free plans, and past the point where you want an upload to start over because the Wi-Fi blinked.

## How do I send the folder?

Drag the session folder, or the zipped Logic project, onto Tranzfer and send. Folders keep their structure, so Audio Files stays Audio Files on the other end. If the connection drops, it retries. If the browser crashes, pick the same files and only what's missing uploads. Your mixer opens the link and downloads, no account. There's more on the [page for music and audio](/for/music).

Keep sessions out of chat apps and anything else that converts audio on the way. A transfer link hands over the same bytes you uploaded.

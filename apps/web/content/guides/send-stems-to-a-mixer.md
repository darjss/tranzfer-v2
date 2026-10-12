---
title: How to send stems to a mixer
description: "How to send stems to a mixer: export every track from the same start at the session's sample rate, skip normalising, name them clearly, and send one folder."
summary: Every stem full length from the same start point, at the session's sample rate and bit depth, no normalising, sensible names, one folder and a notes file.
answer: To send stems to a mixer, export every track as a full-length WAV starting from the same point, at the session's sample rate and bit depth, with normalising off. Name them clearly, put them in one folder per song with a notes file and a rough mix, and send the folder as a download link.
section: formats
order: 34
updated: 2026-10-09
related:
  - { href: /guides/send-pro-tools-or-logic-session, label: Send a Pro Tools or Logic session }
  - { href: /for/music, label: For music & audio }
  - { href: /features/folders, label: Send whole folders }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
faq:
  - q: Should stems start at the same point?
    a: Yes. Export every stem from the same start, usually bar 1 or the session start, and run each one to the same end. Then your mixer drops them in at zero and everything lines up, whatever DAW they use.
  - q: Should I normalise stems before sending?
    a: No, unless your mixer asks. Normalising changes the level of each stem on its own, so the balance you hear stops matching what they get. In Logic, set Normalize to Off when you export.
  - q: What sample rate and bit depth should stems be?
    a: The same as the session. If you recorded at 48 kHz, export at 48 kHz, and use 24-bit or 32-bit float. Converting on the way out adds a step that can't be undone.
  - q: How big are stems?
    a: A 24-bit, 48 kHz mono WAV is 8.64 MB a minute, and stereo is twice that. Forty stereo stems of a 4-minute song come to about 2.8 GB.
  - q: Should I send stems with effects or dry?
    a: Ask your mixer. Some want both for key parts, the printed sound and a dry version. Say which is which in the file names and the notes.
---

## How do I prepare stems?

Stems work in any DAW because they're just audio files that line up. Most mix problems with stems come from a few avoidable mistakes.

- **Same start point for every file.** Export from bar 1 or the session start, even if a part only comes in at the second chorus. The silence costs a little disk space and saves your mixer from guessing.
- **Full length.** Every stem runs to the same end, with reverb and delay tails included.
- **Session sample rate and bit depth.** No converting on export. 24-bit is the usual floor. 32-bit float is fine if your mixer wants it.
- **No normalising** unless asked. Leave headroom as it is.
- **Consolidate.** One continuous file per track, not a scatter of regions.
- **Decide on effects.** Print the sound that's part of the part, like an amp sim or a creative delay. Send a dry copy of anything your mixer might want to rebuild.
- **Mute the master bus processing.** Your mixer will do their own.

## How do I export them in Logic or Pro Tools?

In Logic, choose File, then Export, then All Tracks as Audio Files. [Apple's guide](https://support.apple.com/guide/logicpro/export-tracks-as-audio-files-lgcpb27f70f9/mac) lists the options that matter here. Set Normalize to Off. Tick Include Audio Tail so reverb and delay ring out. Choose whether to bypass effect plug-ins. Apple also notes that for files headed to another app for mixing, you generally don't want volume and pan automation printed. When you export selected tracks instead of all of them, the Range setting can extend silence to the project end, which keeps lengths equal.

In Pro Tools, Avid describes [Bounce Mix](https://resources.avid.com/SupportFiles/PT/Whats_New_in_Pro_Tools_2020.11.pdf) as a way to export stems and sub-mixes, with the time range set by your Timeline selection. Track Bounce, for selected tracks, uses a matching dialog. Select from the session start to the end of the last tail before you bounce, and use the same selection for every stem.

If you'd rather send the whole session, see [how to send a Pro Tools or Logic session](/guides/send-pro-tools-or-logic-session).

## How should I name and organise them?

Names your mixer can sort without opening anything:

```
Song-Title_Stems/
  00_Notes.txt
  00_Rough-Mix.wav
  01_Kick.wav
  02_Snare-Top.wav
  03_Snare-Bottom.wav
  10_Bass-DI.wav
  11_Bass-Amp.wav
  20_Gtr-L.wav
  21_Gtr-R.wav
  30_Lead-Vox.wav
  31_Lead-Vox_Dry.wav
  40_BVs.wav
```

Numbers keep the order, gaps leave room for additions, and the instrument comes first. For an album, one folder per song inside an album folder.

## What goes in the notes file?

- Song title, tempo, key and time signature.
- Sample rate and bit depth.
- The start point every stem shares, like "all files start at bar 1, 0:00".
- Which stems have effects printed and which are dry.
- Anything odd, like a muted part you kept, a tuning fix, or a section that's only in the rough mix.
- References, if you have them, and your deadline.

## How big are stems?

A minute of uncompressed WAV is the sample rate times bytes per sample times channels times 60 seconds.

| Format               | Mono, per minute | Stereo, per minute | 40 stereo stems, 4 minutes |
| -------------------- | ---------------- | ------------------ | -------------------------- |
| 16-bit, 44.1 kHz     | 5.29 MB          | 10.58 MB           | 1.69 GB                    |
| 24-bit, 44.1 kHz     | 7.94 MB          | 15.88 MB           | 2.54 GB                    |
| 24-bit, 48 kHz       | 8.64 MB          | 17.28 MB           | 2.76 GB                    |
| 32-bit float, 48 kHz | 11.52 MB         | 23.04 MB           | 3.69 GB                    |
| 24-bit, 96 kHz       | 17.28 MB         | 34.56 MB           | 5.53 GB                    |

A 12-song album at 24-bit, 48 kHz with 40 stereo stems a song is about 33 GB. That's past most free transfer plans and past email by a long way.

One limit to know for long stems. Standard WAV uses 32-bit addressing, so a file tops out at 4,294,967,296 bytes, as the [EBU's RF64 spec](https://tech.ebu.ch/docs/tech/tech3306v1_1.pdf) explains. A 24-bit, 48 kHz stereo stem hits that after about 248 minutes, and a 5.1 interleaved one after about 83. Songs are nowhere near it. Film and long podcast stems can be.

## How do I send the folder?

Sign in to Tranzfer with Google, drag the stems folder in, and pick how long the link lasts. Folders keep their structure. If the connection drops, it retries. If the browser crashes, pick the same files again and only the missing parts upload. Your mixer opens the link and downloads, no account. Files arrive byte for byte, so nothing gets converted on the way.

Tranzfer Free holds 20 GB live at once, which fits about seven songs of 40 stereo stems at 24-bit, 48 kHz. Starter holds 300 GB for $15 a month. There's more on the [page for music and audio](/for/music).

## When should you use something else?

- **Your mixer works from a shared drive.** If you already share a Dropbox or Google Drive folder, keep using it. Tranzfer links end after 14 days at most.
- **You want comments on mixes.** Tranzfer plays a stem in the browser but has no comments.
- **You need a portal where clients upload to you.** We don't have upload links for clients.

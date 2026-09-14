# VISION.md

Tranzfer starts as a large-file transfer product.

That is not the final idea.

The long-term product is much simpler to describe:

> **Tranzfer moves production files between people automatically.**

Not links.

Not shared drives.

Not storage buckets.

Not portals full of configuration.

People.

A creator sends footage to their editor.

An editor sends an export back to the creator.

A studio sends source material to a freelancer.

The files should arrive where they need to be without everybody repeatedly managing uploads, links, browser tabs, destinations, schedules, or cloud folders.

The ideal interaction is:

> **Alex sent you Episode 14 — 286 GB.**

And the recipient chooses:

- Download now
- Download tonight
- Always download files from Alex automatically

Eventually they may not need to choose anything at all.

That is the direction.

---

# The problem

Today, small creator teams regularly use products that were designed for adjacent problems.

Dropbox and Google Drive are primarily storage and sync products.

WeTransfer is primarily link-based delivery.

MASV is powerful professional transfer infrastructure.

Frame.io is a media collaboration platform.

Signiant serves serious media organizations with heavyweight workflows.

All of these can move files.

The specific workflow Tranzfer cares about is narrower:

> A creator and editor work together every week and repeatedly move tens, hundreds, or thousands of gigabytes between the same computers.

The first transfer is a file-transfer problem.

The fiftieth transfer is a workflow problem.

Tranzfer should become dramatically better on transfer fifty than it was on transfer one.

---

# People, not links

Links remain useful.

They are necessary for compatibility.

But links should not be the core mental model.

The normal Tranzfer experience should become:

```text
Send to
Alice Chen
Video Editor

Episode 24
286 GB

[Send]
```

Alice receives:

```text
Marcus sent you
Episode 24
286 GB

[Download now]
[Download tonight]
```

No URL needs to appear.

No browser needs to stay open.

No one needs to remember where the project should go.

The relationship already knows.

---

# Web is the funnel

Tranzfer must remain useful without installing anything.

The web product has one job:

> **Prove that Tranzfer works.**

A new user should be able to:

```text
open tranzfer.app
drop 100 GB
upload
send
recipient downloads
```

No desktop installation.

No onboarding ceremony.

No enterprise vocabulary.

No configuration maze.

The web experience is how people discover Tranzfer, test it, receive their first transfer, and build trust.

The first successful transfer earns the right to offer something deeper.

---

# Desktop is retention

The desktop app exists because recurring file transfer should not require recurring human attention.

It runs quietly in the background.

Closing the Tranzfer window does not stop the job.

Transfers survive:

- browser closure
- network interruptions
- temporary outages
- application-window closure
- machine restarts
- overnight operation

The desktop app owns a persistent local transfer queue.

Its job is not to become a giant desktop management suite.

Its job is to make transfer disappear into the background.

---

# The native inbox

The desktop app introduces a different interaction model.

Instead of receiving an email containing a download link:

```text
Alex sent you
Travel Documentary — Episode 03

402 GB
3 folders

Scheduled to download at 00:00

[Download now]
[Change schedule]
```

The recipient can configure global behavior:

```text
Downloads

Default
Ask me

or

Automatically download

or

Download overnight
00:00 — 07:00
```

And relationship-specific behavior:

```text
Alex
Always download automatically

Destination
D:\Projects\Alex\Incoming

Schedule
00:00 — 07:00
```

After configuration, future deliveries require almost no interaction.

---

# The relationship is the product

The important object in Tranzfer eventually stops being the share link.

It becomes the connection between two people.

For example:

```text
Marcus
Creator

↕

Alice
Editor
```

That relationship can remember:

```text
raw footage destination
finished export destination
download schedule
bandwidth preferences
notification preferences
expiry rules
project naming
trusted sender status
```

Over time:

```text
Marcus → Alice
Episode 37
184 GB

Marcus → Alice
Episode 38
277 GB

Marcus → Alice
Episode 39
221 GB

Alice → Marcus
Episode 39 Final
18 GB
```

Tranzfer becomes part of their production workflow.

Switching products no longer means choosing another upload button.

It means reconstructing the workflow that already works.

---

# Bidirectional delivery

Creator/editor work is not one-way.

The natural loop is:

```text
                    RAW FOOTAGE
Creator --------------------------------> Editor
   ^                                        |
   |                                        |
   |                                        |
   +----------------------------------------+
                    FINAL EXPORT
```

Tranzfer should eventually make both directions trivial.

Creator side:

```text
Episode 25
→ Alice
```

Editor side:

```text
Episode 25 Final
→ Marcus
```

Both sides know where received material belongs.

Both sides can operate automatically.

No shared-drive architecture is required.

The primitive remains beautifully simple:

> **local files → reliable transfer → local files**

---

# Automatic delivery

Eventually a creator may configure:

```text
Ready for Alice
~/Footage/Ready for Editor
```

A completed project folder placed there becomes:

```text
Episode_31/
       ↓
detected
       ↓
wait until files stop changing
       ↓
upload
       ↓
send to Alice
       ↓
Alice receives notification
       ↓
download overnight
       ↓
D:\Clients\Marcus\Episode_31\
```

Neither person needs to open Tranzfer.

That is the goal.

The system should feel invisible when it works.

---

# Send to a person

Operating-system integration should reinforce the same model.

Finder or Explorer:

```text
Right click
→ Send with Tranzfer
    → Alice
    → Marcus
    → Studio A
```

Not:

```text
Create transfer
Configure transfer
Generate URL
Copy URL
Open chat
Paste URL
```

The destination is a person.

The transfer mechanics are implementation details.

---

# Production software integration

Editing-software integrations may eventually reduce the workflow even further.

The plugin is not the transfer engine.

The desktop application remains the transfer engine.

An NLE integration should be little more than an intelligent command surface.

For example:

```text
Premiere Pro

Tranzfer
─────────────

Export & send to Marcus
```

Which means:

```text
Premiere
   ↓
Adobe Media Encoder
   ↓
final export
   ↓
Tranzfer Desktop
   ↓
background upload
   ↓
Marcus
```

Final Cut Pro could provide the same workflow.

Potential integrations include:

- Premiere Pro
- Final Cut Pro
- DaVinci Resolve
- Explorer
- Finder

But these only matter after the core creator/editor relationship proves valuable.

---

# The funnel

The desired product funnel is:

```text
Reddit / search / recommendation
             ↓
            Web
             ↓
   first large transfer works
             ↓
       recipient receives
             ↓
      recurring workflow?
             ↓
          Desktop
             ↓
 native sender / recipient relationship
             ↓
 automatic delivery
             ↓
 integrations
```

The web application maximizes accessibility.

The desktop application maximizes retention.

Every recipient can become another Tranzfer user.

Every recurring relationship can make the product harder to replace.

---

# The network

The interesting long-term effect is that editors often work with several creators.

An editor who receives a Tranzfer delivery may configure:

```text
Marcus
→ D:\Clients\Marcus

Jane
→ D:\Clients\Jane

Studio North
→ D:\Clients\Studio North
```

They may eventually tell future clients:

> Send it through Tranzfer.

Now recipients help distribute the product.

Likewise, a creator who works with several editors may already have those destinations configured.

This is not a social network.

There is no feed.

There is no follower graph.

It is a **working relationship graph for moving production files**.

That graph only exists to remove friction from actual work.

---

# What the moat is not

The moat is not:

- bigger maximum file sizes
- cheap R2 storage
- zero egress
- an Electron app
- watch folders
- upload resume
- download scheduling
- a Premiere plugin
- prettier share links
- cheaper pricing

All of those can be copied.

Some already exist in competing products.

They are ingredients.

---

# The moat thesis

The potential moat is:

> **Tranzfer becomes the configured transport relationship between creators, editors, studios, and collaborators.**

That includes:

- proven reliability
- recurring sender/recipient relationships
- trusted devices
- persistent destinations
- transfer preferences
- automatic delivery rules
- workflow history
- native integrations
- recipient-driven distribution
- habits formed around a system that simply works

Each individual feature can be copied.

The accumulated workflow is harder to replace.

The product gets better the longer two people use it together.

That is the moat thesis.

It must be earned.

---

# Reliability still comes first

None of this vision matters if transferring 350 GB is unreliable.

The hierarchy never changes:

```text
reliability
    ↓
confidence
    ↓
recurring usage
    ↓
automation
    ↓
workflow
    ↓
moat
```

Tranzfer must first become extremely good at moving bytes.

Only then does it earn the right to disappear into the workflow.

---

# What we are not building

Tranzfer is not trying to become:

- Dropbox
- Google Drive
- Frame.io
- LucidLink
- a mounted cloud filesystem
- a digital asset manager
- a video review platform
- a project-management suite
- cloud editing infrastructure
- permanent archive storage

Do not build filesystem sync.

Do not build document collaboration.

Do not build timelines and review comments because competitors have them.

Do not turn Tranzfer into a giant creative-software suite.

The product can remain focused:

> **move files from one person's machine to another person's machine extremely well.**

Everything else must support that.

---

# The path

## Phase 0 — Web proof

```text
drop files
upload reliably
share / send
download
```

Prove 100 GB.

Prove 350 GB.

Put it in real workflows.

Find paying users.

---

## Phase 1 — Desktop transport

After recurring demand exists:

```text
background upload/download
persistent queue
resume after restart
tray app
folder preservation
bandwidth controls
native notifications
```

The desktop client should remove browser babysitting.

---

## Phase 2 — Native inbox

Recipients become first-class Tranzfer users.

```text
Marcus sent you Episode 24
286 GB

Download now
Download tonight
Always download from Marcus
```

Links become fallback behavior rather than the primary interface.

---

## Phase 3 — Relationship automation

Remember recurring workflows:

```text
Marcus
→ Alice
→ D:\Projects\Marcus
→ overnight
```

Add:

```text
trusted senders
automatic downloads
watch folders
relationship presets
bidirectional workflow
```

---

## Phase 4 — Native workflow integration

Only after the above is proven:

```text
Finder / Explorer
Premiere
Final Cut Pro
DaVinci Resolve
```

The goal is fewer actions, not more features.

---

# The ideal end state

A creator finishes copying footage.

They send it to their editor.

Or perhaps they do nothing at all.

Tranzfer notices.

The upload runs in the background.

The creator leaves.

The editor receives:

> **Marcus sent you Episode 42 — 312 GB.**

The editor has already configured Tranzfer to receive Marcus's files overnight.

At midnight, the download starts.

At 06:40:

```text
✓ Episode 42
312 GB

Downloaded to
D:\Projects\Marcus\Episode 42
```

The editor wakes up.

The files are there.

They open the folder and start working.

Nobody copied a link.

Nobody managed cloud storage.

Nobody babysat a browser.

Nobody thought about Tranzfer.

That is success.

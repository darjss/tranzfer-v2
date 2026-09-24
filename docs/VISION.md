# Vision

I have spent an unreasonable part of my life watching progress bars.

Not metaphorically. Actual progress bars. A 286 GB folder of raw footage crawling toward someone's cloud drive at 11 pm, a laptop that cannot close, a browser tab I am scared to touch. Then the Wi-Fi blinks at 94% and the whole thing starts over from zero, and somewhere an editor who was supposed to start cutting in the morning gets a message that says "sorry, uploading again."

This happens every week to people who make things for a living. Every single week. It is so normal that nobody even complains anymore. They just leave the laptop open overnight and pray.

I think that is insane. I have thought about it in the shower, on planes, at other people's weddings. I know R2 caps a multipart upload at 10,000 parts without looking it up. I have opinions about part sizes that have ended conversations. I have lain awake wondering what happens when a laptop falls asleep in the middle of `CompleteMultipartUpload`, and whether the response or the object wins.

Tranzfer is what happens when someone refuses to let this go.

## The one sentence

> Tranzfer moves production files between people. Automatically.

Not links.

Not shared drives.

Not buckets, portals, workspaces or a settings page with forty toggles.

People.

A creator sends footage to their editor. The editor sends the cut back. A studio sends source material to a freelancer. The files show up where they belong, and nobody babysits anything.

The interaction I am building toward is one notification:

```text
Alex sent you Episode 14
286 GB

[Download now]  [Download tonight]  [Always accept from Alex]
```

And eventually not even that. Eventually the footage is just on the editor's drive when they sit down with their coffee, in the right folder, verified, and the only evidence Tranzfer exists is that nothing went wrong.

## Transfer one versus transfer fifty

Dropbox and Google Drive are storage that happens to share. WeTransfer is a link with a timer. MASV is serious professional transfer. Frame.io is review. Signiant is for companies with a procurement department. All of them can move a file. None of them were built for the thing I actually care about:

> The same two people, moving hundreds of gigabytes between the same two computers, every week, for years.

The first transfer is a file-transfer problem. Can the bytes get there without dying?

The fiftieth transfer is a workflow problem. Why am I still copying a link into a chat? Why does my editor still have to pick the folder? Why is anyone awake for this?

Tranzfer has to be good at transfer one or nobody reaches transfer fifty. But transfer fifty is where it should feel like magic. It should get better every time the same two people use it, until it disappears.

## People, not links

Links stay. They are how the first file reaches someone who has never heard of us. But the link is a compatibility layer, not the product.

The product looks like this:

```text
Send to
Alice Chen, editor

Episode 24
286 GB

[Send]
```

And Alice sees:

```text
Marcus sent you Episode 24
286 GB

[Download now]  [Download tonight]
```

No URL. No tab that must stay open. No "where did you want this again?" The relationship already knows.

## The relationship is the product

The real object in Tranzfer, the one worth obsessing over, is not a file or a link. It is the line between two people.

```text
Marcus (creator)  <------>  Alice (editor)
```

That line remembers everything the two of them would otherwise have to remember:

```text
where raw footage lands on Alice's machine
where finished exports land on Marcus's machine
when to download (now, tonight, only on ethernet)
who is trusted to send without asking
how long files live before they expire
```

Then the history piles up:

```text
Marcus -> Alice   Episode 37        184 GB
Marcus -> Alice   Episode 38        277 GB
Marcus -> Alice   Episode 39        221 GB
Alice  -> Marcus  Episode 39 final   18 GB
```

After a few months of that, switching away from Tranzfer does not mean choosing a different upload button. It means rebuilding a working setup that already works. That is the only moat I believe in.

## It goes both ways

Creator work is a loop, not a pipe.

```text
          raw footage
Creator ----------------> Editor
   ^                        |
   +------------------------+
          final export
```

Both directions should be one action. Both sides know where incoming material belongs. No shared drive in the middle, no sync conflicts, no folder called "FINAL_final_v3_USE_THIS". The whole model is:

> local files -> reliable transfer -> local files

That's it. Everything else is detail.

## Where it ends up

Watch folders. Marcus drops `Episode_31/` into `Ready for Alice`. Tranzfer waits until the files stop changing, uploads, and tells Alice. Alice's machine pulls it overnight into `D:\Clients\Marcus\Episode_31\`. Neither of them opens the app.

Right click in Finder or Explorer:

```text
Send with Tranzfer
  -> Alice
  -> Marcus
  -> Studio North
```

Instead of the current ritual. Create transfer, configure transfer, generate link, copy link, open chat, paste link, wait, check, re-send.

Then, much later, "Export and send to Marcus" inside Premiere, Resolve or Final Cut. The plugin is just a button. The desktop app is still the engine.

## The network that is not a social network

Editors work with lots of creators. An editor who gets one Tranzfer delivery sets up `D:\Clients\Marcus`, then `D:\Clients\Jane`, then starts telling new clients "just send it through Tranzfer." Creators with several editors do the same in the other direction.

No feed. No followers. No likes. It is a graph of working relationships that exists only to move production files with less friction. Every recipient is a possible sender. That is the growth plan, and it only works if the product is good.

## What is not the moat

Big file limits. Cheap R2 storage. Zero egress. An Electron app. Resume. Watch folders. Scheduled downloads. A Premiere plugin. Pretty share pages. Low prices.

All copyable. Most already exist somewhere. They are ingredients, not the dish.

The moat is being the configured, trusted pipe between specific people who work together. Earned one boringly successful delivery at a time.

## Reliability first, forever

None of the above matters if a 300 GB upload restarts from zero because a router rebooted. Automation on top of a fragile transfer is just automated failure. So the order is fixed:

```text
reliable transfer -> background transfer -> trusted relationships -> automatic delivery
```

[RELIABILITY.md](RELIABILITY.md) is the contract. I would rather ship nothing than ship a resume button that lies.

## The path

These are directions, not a dependency graph. Each phase ships, gets used by real people, and earns the next one.

1. Web proof. Open tranzfer.app, drop 100 GB, send, recipient downloads. No install, no onboarding, no enterprise vocabulary. Survive interruptions and pass the reliability gates before claiming anything.
2. Desktop transport. Transfers outlive the window, the browser, the network and a reboot. It lives in the tray and stays quiet.
3. Native inbox. Files land in the agreed folder, with disk-space checks, progress and recovery. "Download tonight" becomes real.
4. Relationship automation. Remembered people, destinations and rules. Work flows back from editor to creator just as easily.
5. Production tool integration. Only when a real repeated workflow shows the need.

Web is how people find out Tranzfer works. Desktop is why they stay. The web product has one job, which is proving the first transfer. Desktop has one job, which is making every transfer after that need less of a human.

## What I refuse to build

Cloud-drive sync. Public file hosting. Project management. Digital asset management. Mounted network filesystems. A review tool. A chat app. A social network. An "AI-powered" anything.

And no desktop app, network or automation platform before real transfers prove people want them. Building the cathedral before anyone has walked through the door is the most comfortable way to fail, and it is always tempting.

## The end state

Marcus finishes shooting, drops the card dump in a folder, and goes to sleep.

Alice wakes up, and Episode 40 is on her drive. Verified, in the right place.

Neither of them thought about Tranzfer once. That's the product.

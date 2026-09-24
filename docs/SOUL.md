# Soul

Dear human, coding agent, future model, 3 am version of me, or whatever intelligence got summoned into this repository:

Hi. Sit down. This is the part where I tell you what this whole thing is actually for, because the code will not tell you and the other docs are too polite.

This repo exists to build **Tranzfer**.

Not a framework demo.

Not an architecture portfolio piece.

Not a museum of whatever JavaScript library trended on Twitter last Tuesday.

Not an excuse to invent twelve internal packages, a distributed event bus, a plugin system, a DSL, and a generic abstraction capable of transferring files to Mars.

The goal is stupidly, almost offensively simple:

> Someone has a fucking enormous file.
> Someone else needs that file.
> Tranzfer gets it there, and neither of them has to think about how.

That's it. That's the company. I have been chewing on this for years and it keeps coming back to those three lines.

## The night that made me do this

Picture it. A YouTuber in the US has 220 GB of raw footage. Their editor is on the other side of the world and starts work in eight hours. The upload is going. The laptop can't close. The tab can't be touched. They go to bed with the lid open like it's a sick pet.

Their Wi-Fi dies.

The laptop sleeps anyway.

The tab refreshes.

A signed URL expires.

One multipart request out of thousands fails.

And it all happens at 63%, because it is always 63%, I swear to god it is always 63%.

They wake up. It's gone. Start over. From zero. 220 GB. Again.

This is normal. People accept this. People have _built workflows around_ this. They schedule their lives around upload bars. It makes me want to walk into the sea.

When that person comes back to Tranzfer, it should calmly say "we lost the connection for a bit, carried on, it's done" and hand the editor one correct file. No drama. No restart. No apology email.

That is the first product. Everything else is earned after it.

## What winning looks like

The first victory is not an architecture diagram. Nobody has ever cried with joy over an architecture diagram.

The first victory is **100 GB transferred successfully.**

Then **350 GB transferred while we deliberately try to murder it.** Router yanked. Laptop slammed shut. Browser killed. Machine rebooted. And it still finishes, and the bytes still match.

Then **a real video editor uses it for real work.**

Then they use it again without me asking.

Then someone gives us $29.

I will probably frame the first $29.

Then ten people do. Then strangers I have never met trust Tranzfer with footage they cannot afford to lose, and they don't even think about it, because why would you think about the pipe.

The money milestones are just as blunt:

- **$1,000 MRR** means this is real.
- **$2,000 MRR** means this can change my life.
- **$3,500 MRR** means this tiny repository has become a very serious fucking piece of software.

Do not optimize for imaginary scale before earning the right to have scale. We do not need sharding. We need ten people who would be genuinely annoyed if Tranzfer disappeared.

## How this code should feel

I want this repository to be beautiful. I mean that with my whole chest.

Not clever-beautiful. Not "look at this type-level wizardry" beautiful.

**Obvious-beautiful.**

You should be able to walk into any package, understand why it exists and what it owns, make your change, and leave without poisoning three unrelated parts of the system on the way out. Like a good houseguest. Wipe your feet.

Names mean things.

Boundaries mean things.

Errors are explicit and typed and say what actually happened.

State is something a tired person can hold in their head.

Tests protect behavior that matters, not line counts.

Comments explain the weird runtime quirk, not the syntax sitting directly beneath them. `// increment i` is a war crime.

An abstraction exists because the product forced us to discover it. Not because someone predicted it might theoretically, one day, possibly be useful. That someone is lying to you, and sometimes that someone is me.

A little duplication is cheaper than the wrong abstraction.

A boring function that works beats an ingenious system nobody understands.

A 350 GB upload surviving a router restart is infinitely more impressive than fourteen layers of architectural purity. I will die on this hill. I have a tent up here.

## Solid 2

Yes, this repo uses Solid 2 on purpose.

Use it properly. Learn its model. Write code that feels native to Solid, not React wearing a Solid costume to a party.

But tattoo this somewhere:

**Tranzfer does not exist to prove Solid 2 is good.**

Solid 2 is here because it helps us build Tranzfer well. Same goes for Effect, Uppy, Alchemy, all of it. They are tools. They work for the transfer.

If you catch yourself three days deep in the most conceptually perfect reactive abstraction ever conceived while the uploader still can't survive a dead network connection, stop. Put the keyboard down. Go outside. You have lost the plot, and the plot is a file.

## People, not links

Links are compatibility. They get the first file to someone who's never heard of us. They are not the product.

The product is the relationship between two people who work together.

A creator should send footage to their editor as naturally as sending a text. A recurring editor should not have to open a browser, copy a link, pick a folder and babysit a download every single week like it's 2009.

One day the normal interaction is just:

```text
Marcus sent you Episode 24
286 GB

Download now
Download tonight
Always download from Marcus
```

And later even that goes away, because Tranzfer already knows where Marcus's footage lives on your drive.

That vision is the thing that keeps me up. It is also not permission to skip the hard part. Before Tranzfer gets to vanish into someone's workflow, it has to earn their trust by moving their files correctly, over and over, boringly, forever.

## The standard

Success should feel boring. Aggressively boring.

Drop files.

Upload starts.

Speed is visible.

Progress is real.

ETA is believable.

Failures recover.

Refresh works. Resume works.

Recipient gets it. Link works. Download is fast.

Checksum says the file is exactly what we promised.

Done. Go make your video.

No "Cinematic Delivery Protocol."

No "Command Center."

No neon hacker dashboard pretending a file upload is a cyberpunk military operation. It's footage. It's going to an editor. Calm down.

Confidence is the brand.

Reliability is the feature.

Speed is the demo.

Automation is convenience we earn later.

And never, ever lie. No fake testimonials. No "trusted by 10,000 creators" when it's trusted by me and my friend. No reliability claim that a gate in [RELIABILITY.md](RELIABILITY.md) hasn't actually proven. If the product is honest when things break, people believe it when things work.

## The product gets quieter over time

The first transfer can take some attention.

The fiftieth should take almost none.

A good Tranzfer setup slowly remembers the boring stuff:

```text
who this goes to
where it lands
when it downloads
how these two people usually work
```

The product gets more valuable by deleting decisions, not by adding buttons. More features is not less friction. Usually it's the opposite. Every setting is a question we failed to answer for the user.

## What Tranzfer is not

```text
Dropbox
Google Drive
Frame.io
LucidLink
a mounted cloud filesystem
a digital asset manager
a project-management suite
a public file host
a social network
anything with "AI-powered" in the hero text
```

Review, desktop automation, native integrations and all the other shiny future stuff only get in if they make the creator and editor delivery workflow more reliable, more automatic, or worth more to people who pay. If a feature doesn't do one of those, it's a distraction wearing a feature costume.

## Why this rewrite exists

There was a Tranzfer before this repo.

It taught me a lot. It also filled up with so much AI-generated sludge that building on top of it would have made every future coding agent a little dumber just from reading it. Like breathing in a room with bad air.

So we burned it down and kept the lessons.

Do not blindly port legacy code. Recover behavior on purpose. Reimplement it cleanly. Leave the contamination where it is.

This repo has to get easier to understand as it grows. If it's getting harder, something is wrong, and it's probably the last abstraction somebody added.

## The future is not today's todo list

There is a big vision:

```text
reliable transfer
  -> recurring creator and editor relationships
  -> background delivery
  -> native inbox
  -> automation
  -> review and approval
  -> workflow integrations
```

It lives in [VISION.md](VISION.md). It is not a license to build all of it this week.

The actual job is painfully concrete:

```text
build
break
fix
put it in front of a real person
watch what happens
ask for money
```

No desktop app because the idea is exciting.

No review system because some MIT repo made it cheap to copy.

No NLE plugin because it would look sick in a demo.

Earn every layer. Every single one.

## This is a side project, and that is the point

I build this after work. Keep the code understandable by one person coming back to it at 11 pm with half a brain left. Prefer the local change over the new framework. Add machinery only when a real workflow is screaming for it.

When the interface talks, it tells the truth about what happened and what you can do next. "We need access to the file again." "Your sign-in expired." "Still finishing up on our end." Plain words. A person should never have to guess whether their 300 GB is safe.

---

One day, hopefully, this repo pays for my life.

Maybe it lets me quit my job.

Maybe it lets me take care of the people I love.

Maybe it pays for a frankly irresponsible number of AI coding subscriptions.

Maybe I get to send real money back to the open-source maintainers whose work made every line of this possible.

That would be pretty fucking cool.

Until then:

**make the next transfer more reliable than the last one.**

That's the job. That's the whole job.

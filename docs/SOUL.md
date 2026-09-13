# SOUL.md

Dear human, coding agent, future model, sleep-deprived version of me, or whatever intelligence has been summoned to work on this repository:

This repo exists to build **Tranzfer**.

Not a framework demo.

Not an architecture portfolio piece.

Not a playground for whatever JavaScript library became fashionable yesterday.

Not an excuse to invent twelve internal packages, a distributed event bus, or a generic abstraction capable of transferring files on Mars.

The goal is stupidly simple:

> Someone has a fucking enormous file.  
> Someone else needs that file.  
> Tranzfer gets it there quickly, reliably, and without making either person think about how any of this works.

A YouTuber in the US should be able to send hundreds of gigabytes of raw footage to an editor on the other side of the world.

Their Wi-Fi can die.

Their laptop can sleep.

The tab can refresh.

A signed URL can expire.

A multipart request can fail.

The upload can be 63% complete when everything goes to shit.

And when they come back, Tranzfer should calmly continue instead of making them restart 220 GB from zero.

That is the first product.

The longer-term product is the relationship between the people doing the work.

But we earn that future by making the transfer reliable first.

---

## What success looks like

The first victory is not an elegant architecture diagram.

The first victory is:

**100 GB transferred successfully.**

Then:

**350 GB transferred successfully while we deliberately try to kill it.**

Then:

**a real video editor uses it for real work.**

Then they use it again.

Then someone gives us $29.

Then ten people do.

Then strangers we have never met trust Tranzfer with footage they cannot afford to lose.

The business milestones are equally simple:

**$1,000 MRR** means this is real.

**$2,000 MRR** means this can change my life.

**$3,500 MRR** means this tiny repository has become a very serious fucking piece of software.

Do not optimize for imaginary scale before earning the right to have scale.

---

## How this code should feel

I want this repository to be beautiful.

Not clever-beautiful.

**Obvious-beautiful.**

A good engineer or a good coding agent should be able to enter a package, understand why it exists, understand what it owns, make the change, and leave without poisoning three unrelated parts of the system.

Names should mean things.

Boundaries should mean things.

Errors should be explicit.

State should be understandable.

Tests should protect behavior that matters.

Comments should explain things that aren't obvious, not narrate the syntax directly underneath them.

If an abstraction exists, it should be because the product forced us to discover it — not because somebody predicted that perhaps one day it might theoretically become useful.

A little duplication is cheaper than the wrong abstraction.

A boring function that works is better than an ingenious system nobody understands.

A 350 GB upload surviving a router restart is infinitely more impressive than 14 layers of architectural purity.

---

## Solid 2

Yes, this repo uses Solid 2 intentionally.

Use it properly.

Learn its model.

Write code that feels native to Solid rather than React translated into Solid syntax.

But remember:

**Tranzfer does not exist to prove Solid 2 is good.**

Solid 2 exists here because it helps us build Tranzfer well.

If you find yourself spending three days creating the world's most conceptually perfect reactive abstraction while the uploader still can't recover from a dead network connection, you have lost the plot.

---

## People, not links

Links are compatibility.

They are not the long-term product.

The long-term product is the relationship between the people doing the work.

A creator should eventually be able to send footage to their editor as naturally as sending them a message.

A recurring editor should not need to open a browser, copy a link, choose a folder, and babysit a download every week.

One day the normal interaction might be:

```text
Marcus sent you Episode 24
286 GB

Download now
Download tonight
Always download from Marcus
```

And later, maybe even that becomes unnecessary because Tranzfer already knows where the files should go.

That vision matters.

But it does not give us permission to skip the hard part.

Before Tranzfer can disappear into someone's workflow, it has to earn their trust by moving their files correctly.

---

## The standard

The software should feel boring when it succeeds.

Drop files.

Upload starts.

Speed is visible.

Progress is real.

ETA is believable.

Failures recover.

Refresh works.

Resume works.

Recipient receives it.

If they use the web, the link works.

If they use Tranzfer regularly in the future, the file should be able to arrive on their machine without ceremony.

Download is fast.

Checksum says the file is what we promised it was.

Done.

No “Cinematic Delivery Protocol.”

No “Command Center.”

No pretending file transfer is a cyberpunk military operation.

Confidence is the brand.

Reliability is the feature.

Speed is the demonstration.

Automation is earned convenience.

---

## The product should get quieter over time

The first transfer may require attention.

The fiftieth should require almost none.

A good Tranzfer workflow gradually remembers the boring things:

```text
who this goes to
where it should land
when it should download
how this relationship normally works
```

The product becomes more valuable by removing repeated decisions.

That does not mean building a giant creative-suite dashboard.

It means making recurring file movement disappear into the background.

Do not confuse more features with less friction.

---

## What Tranzfer is not

Tranzfer is not trying to become:

```text
Dropbox
Google Drive
Frame.io
LucidLink
a mounted cloud filesystem
a digital asset manager
a project-management suite
a generic public file host
```

Review, desktop automation, native integrations, and other future capabilities only belong here if they strengthen the same creator/editor delivery workflow.

If a feature does not make that workflow more reliable, more automatic, or more valuable to paying users, it is probably a distraction.

---

## Remember why this rewrite exists

There was a Tranzfer before this repository.

It taught us things.

It also accumulated enough AI-generated sludge that continuing to build on top of it would make every future coding agent slightly dumber simply by reading the code.

We are not rewriting history.

We are keeping the lessons and throwing away the contamination.

Do not blindly port legacy code.

Recover behavior deliberately.

Reimplement it cleanly.

This repository should get easier to understand as it grows, not harder.

---

## Future vision is not today's todo list

There is a bigger vision now:

```text
reliable transfer
    ↓
recurring creator/editor relationships
    ↓
background delivery
    ↓
native inbox
    ↓
automation
    ↓
review / approval
    ↓
workflow integrations
```

That direction belongs in `VISION.md`.

Do not treat it as permission to build all of it immediately.

The current job remains painfully concrete:

```text
build
break
fix
put it in front of a real person
watch what happens
ask for money
```

No desktop app because the idea is exciting.

No review system because an MIT repo made it cheap to copy.

No NLE plugin because it looks cool in a demo.

Earn every layer.

---

One day, hopefully, this repo pays for my life.

Maybe it lets me quit my job.

Maybe it lets me take care of the people I love.

Maybe it pays for a stupid amount of AI coding subscriptions.

Maybe I get to send some money back to the open-source maintainers whose work made the whole thing possible.

That would be pretty fucking cool.

Until then:

**make the next transfer more reliable than the last one.**

That's the job.

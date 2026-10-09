---
title: MASV pricing explained, with worked examples
description: MASV pricing explained. The free 15 GB, $0.25 per GB pay as you go, annual bundles, pre-buy credits and storage fees, worked out for real monthly volumes.
summary: Free 15 GB, then $0.25 per GB leaving the network, plus bundles, credits and storage. What a real month costs.
answer: MASV pricing is per gigabyte. You get 15 GB free each month, then pay $0.25 for every GB that leaves MASV's network, unless you commit to an annual bundle from $58 a month for 250 GB or prepay credits.
section: comparisons
order: 40
updated: 2026-10-09
related:
  - { href: /compare/wetransfer-vs-masv, label: WeTransfer vs MASV pricing }
  - { href: /alternatives/masv, label: MASV alternatives }
  - { href: /vs/masv, label: Tranzfer vs MASV }
  - { href: /pricing, label: Price calculator }
faq:
  - q: Is MASV free?
    a: The first 15 GB each month are free, and files stay free for 5 days. MASV still asks for a valid credit card to sign up and places a $10 pre-authorization hold that it releases.
  - q: Does MASV charge for uploads or downloads?
    a: Its pricing page says charges are incurred only when data exits the platform, as a download to a machine or an upload to connected storage. It bills that egress per gigabyte.
  - q: Does unused MASV bundle data roll over?
    a: No. MASV's help center says the monthly allowance on a subscription doesn't roll over from month to month. Subscriptions run for a year and are paid monthly.
  - q: How long do MASV credits last?
    a: Pre-buy credits are valid for 180 days. A 5 TB pack is $1,229, which works out to about $0.24 per GB.
---

Every number here comes from [MASV's pricing page](https://masv.io/pricing) and help center, read on 9 October 2026. We make Tranzfer, which charges a flat monthly price instead, so there's a short note on that at the end.

## How does MASV charge?

There are four parts to a MASV bill.

1. **A free allowance.** 15 GB every month. Once it's used, the account moves to pay as you go.
2. **Data leaving the network.** $0.25 per GB on pay as you go. MASV's words are that "charges are incurred only when data exits the platform", either as a download or as an upload to connected storage such as S3.
3. **Storage.** Files are free for 5 days, then $0.07 per GB per month.
4. **A commitment, if you want a lower rate.** Annual bundles or prepaid credits.

A valid credit card is required to sign up, even if you never pass 15 GB. MASV holds $10 on the card and releases it, usually within a week.

## What do the annual bundles cost?

| Bundle | Per month | Per GB | Commitment                |
| ------ | --------- | ------ | ------------------------- |
| 250 GB | $58       | $0.23  | 12 months, billed monthly |
| 500 GB | $110      | $0.22  | 12 months, billed monthly |
| 1 TB   | $215      | $0.21  | 12 months, billed monthly |
| 2 TB   | $410      | $0.20  | 12 months, billed monthly |

The volume refreshes each month and [doesn't roll over](https://help.massive.io/en/does-unused-data-for-my-masv-subscription-roll-over-to-the-next-month). Going over is billed at what MASV calls a discounted overage rate; the pricing page doesn't give the number.

Prepaid credits are the other route: 5 TB for $1,229, 10 TB for $2,355 or 25 TB for $5,632, each valid for 180 days.

## What does a real month cost on MASV?

Each delivery downloaded once, nothing stored past 5 days.

| Data out in a month | Pay as you go | Cheapest bundle that covers it |
| ------------------- | ------------- | ------------------------------ |
| 30 GB               | $3.75         | none needed                    |
| 100 GB              | $21.25        | none needed                    |
| 250 GB              | $58.75        | $58 (250 GB)                   |
| 500 GB              | $121.25       | $110 (500 GB)                  |
| 1 TB                | $246.25       | $215 (1 TB)                    |
| 2 TB                | $496.25       | $410 (2 TB)                    |

Pay as you go is the GB minus the free 15, times $0.25. Under about 250 GB a month, the bundles don't save anything and lock you in for a year. Above that they save about 9 to 17 percent, as long as every month is busy.

## What makes a MASV bill bigger than expected?

- **More than one download.** The fee is on data leaving the network. If a producer and an editor both download a 100 GB package, more data leaves. The pricing page doesn't spell out how that case is counted, so check before you send to a group.
- **Forwarding through portals.** MASV's help says files forwarded from a portal to an integration [count toward your data usage](https://help.massive.io/en/how-to-use-a-portal-to-send-files-to-integrations) the same way a download does.
- **Leaving files up.** A 200 GB package kept for a month past the free 5 days adds $14 at $0.07 per GB.
- **A browser upload that restarts.** MASV's help says that if you close the browser tab or the computer crashes, [you start over](https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload). That costs time, not money, since billing is on the way out. The desktop app recovers from most interruptions.

## When is MASV's pricing the right fit?

When you send rarely or unevenly. A month with one 50 GB delivery costs $8.75, and a month with none costs nothing. It also fits teams who need portals, integrations and a desktop app, since those come with the per-GB price rather than per seat. MASV lists no paid seats.

It fits worse when you send hundreds of gigabytes every week. That's where a flat plan wins. Tranzfer is $15 a month for 300 GB live at once, $29 for 1 TB and $69 for 3 TB, however many times the space turns over in a month. It runs in the browser only, with no portals. Put your own numbers into the [price calculator](/pricing), or see the [WeTransfer vs MASV pricing](/compare/wetransfer-vs-masv) comparison.

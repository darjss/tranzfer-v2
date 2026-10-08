# Product and pricing

Tranzfer is a large-file delivery tool for creative work. It is not permanent cloud storage, a drive replacement, or a cheap WeTransfer clone. [VISION.md](VISION.md) says where it goes; this file says what it sells today and for how much.

## Why people pick it

Huge transfers that recover instead of restart. A 100 to 500 GB project survives bad Wi-Fi, a sleeping laptop, a refreshed tab and expired authorization. Tranzfer keeps the parts that arrived, checks them, and sends only what's missing.

- The sender uploads; the recipient gets one link and needs no account.
- Deliveries expire. Short retention keeps the product about delivery and keeps R2 costs sane.
- Progress is honest. The app never shows recovery or completion that hasn't happened.

## Principles

- Reliability before features.
- One obvious path to send and receive.
- Recovery is in every plan, free included. Never sell resume as an upgrade.
- Don't become Dropbox by accident.
- The dashboard gets the same design care as the landing page.
- Real product screenshots and real creative work, not AI lifestyle images.

## Plans

| Plan    | Price  | Active transfer space | Link lifetime | For                           |
| ------- | ------ | --------------------- | ------------- | ----------------------------- |
| Free    | $0     | 20 GB                 | up to 3 days  | trying it, small sends        |
| Starter | $15/mo | 300 GB                | up to 7 days  | occasional large projects     |
| Pro     | $29/mo | 1 TB                  | up to 14 days | working creatives             |
| Studio  | $69/mo | 3 TB                  | up to 14 days | heavy users and small studios |

Every plan gets the whole product: large uploads, resume, folders, links, progress and history. Paid plans buy capacity and retention, nothing else. Don't promise teams, branding, request links or enterprise features before they exist.

## How capacity works

Capacity is active transfer space. It isn't storage you keep, and it isn't a monthly bandwidth quota. A delivery counts against it from creation until it expires, is cancelled or is purged; then the space is free again. A Pro user can send 5 TB in a month as long as no more than 1 TB is live at once.

A new delivery that would push active space past the plan's limit is refused before any bytes upload, with copy that names the limit and the upgrade.

## Rate limits

Limits stop one person or bot from flooding sign-up, sign-in or the Free plan. They sit well above what a real person does, so nobody sending work should ever meet one. Over a limit, the request is refused with how long to wait, and the app says so in words. The numbers live in `rateLimits` in `packages/contracts/src/billing.ts`.

| Limit                   | Counted per | Plans | Cap                   |
| ----------------------- | ----------- | ----- | --------------------- |
| Requests to sign-in     | client IP   | all   | 30 a minute           |
| New accounts            | client IP   | all   | 10 a day              |
| New deliveries          | sender      | Free  | 20 an hour, 100 a day |
| Upload signing requests | sender      | Free  | 200 every 10 seconds  |

Sign-in covers every `/api/auth` request, Google's start and callback and the staging login included. An IPv6 client counts by its /64. Cancelled deliveries count toward the delivery cap, so create-and-cancel can't loop. A part is at least 64 MiB, so 20 signing requests a second is faster than a gigabit line needs. Paid and comp plans have no delivery or signing cap; they pay for what they use.

## Cost guardrail

R2 storage is about $0.015 per GB-month, and egress is free. Worst case, with the allocation full all month:

| Plan    | Active space | R2 cost  |
| ------- | ------------ | -------- |
| Free    | 20 GB        | $0.30/mo |
| Starter | 300 GB       | $4.50/mo |
| Pro     | 1 TB         | $15/mo   |
| Studio  | 3 TB         | $45/mo   |

Normal use is upload, download, then expiry, so real cost is a fraction of that. The beta checks the assumption before these prices are final.

## Beta

Keep the beta small enough to watch closely. Testers use the free plan unless they want more. Measure:

- average active GB and retention per user
- repeat sends
- interrupted uploads that recovered
- how often people hit their limit, and which plan they fit

The beta works when people trust Tranzfer with real projects and come back.

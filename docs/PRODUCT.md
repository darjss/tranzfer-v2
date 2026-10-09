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

## When paid plans open

Production doesn't sell paid plans yet. Polar is still verifying the live organization's identity for payouts, and until that clears production runs with paid plans closed. One switch decides it per stage: `PAID_PLANS_OPEN`, read by `paidPlansOpen` in `apps/api/src/infrastructure/polar.ts`. It defaults to `false` on production and `true` on every sandbox stage (staging, previews, local).

A closed stage:

- declares no Polar products or webhook endpoint and never reads `POLAR_ACCESS_TOKEN`
- fails checkout and the billing portal with `BillingUnavailable` reason `notOpen`, and rejects Polar webhooks
- builds the web with `VITE_PAID_PLANS_OPEN=false`: pricing keeps the prices and each paid plan offers "Tell me when it opens", the dashboard shows no upgrade or Manage billing, and a `?plan=` from sign-in doesn't start a checkout

"Tell me when it opens" puts the visitor on that plan's interest list (`plan_interest`, one row per address and plan) through the public `JoinInterest` RPC. A signed-in visitor joins in one click with their account's address; anyone else types one. Each new row gets one "You're on the list" email. Asking again changes nothing and sends nothing.

To open production once Polar clears verification:

1. Check the production environment's `POLAR_ACCESS_TOKEN` secret is a live-organization token with the scopes in `.env.example`.
2. Set the GitHub variable `PAID_PLANS_OPEN` to `true` in the production environment.
3. Re-run the deploy workflow on `main`. It creates the three live products and the webhook endpoint, then ships the web with checkout buttons.

No code changes. Setting the variable back to `false` and redeploying closes it again and deletes the live webhook endpoint; products stay in Polar.

Then tell the people who asked. The interest list promises one email the day a plan opens, so send it once per plan, after the deploy is live. From the main checkout, count first, then queue:

```text
INTEREST_PLAN=pro INTEREST_DRY_RUN=true vp run --filter @tranzfer/api interest:notify -- --stage production
INTEREST_PLAN=pro vp run --filter @tranzfer/api interest:notify -- --stage production
```

Repeat for `starter` and `studio`. The command is a small Alchemy stack (`apps/api/scripts/interest-notify.ts`) that finds the stage's D1 through the main stack's state and runs with the same local Cloudflare credentials as a deploy. It prints `waiting` (on the list, not yet emailed) and `queued`. It sends nothing itself: the API Worker's minute sweep sends 20 queued emails a minute and marks each `notified_at`. A send that fails is unqueued, so running the command again retries only those.

## Access codes

A code gives a paid plan for free for a set number of days, so beta testers get Pro before billing opens. It never touches Polar. While a grant is live the user gets the higher of it and their subscription, and when it ends they drop back to whatever the subscription gives. Codes work the same with paid plans open or closed. `Plans` in `apps/api/src/plans.ts` decides the plan for every limit.

- Each code has a plan, a grant length in days, a number of uses and an optional last day to redeem. Codes ignore case.
- One user redeems a code once. A use is spent only when the grant lands. The redemption's write checks the code again, so a code that ran out of uses, expired or was revoked after the redemption read it grants nothing.
- Send `https://tranzfer.app/sign-in?code=BETA-PRO`. The code survives Google sign-in and redeems on the dashboard. A signed-in user can also type it under "Have a code?" in the account menu.

Create, list and revoke codes with `scripts/codes.ts` in `apps/api`. Alchemy finds the stage's D1 in the stack's state and queries it with your Alchemy profile's Cloudflare credentials, the same ones `alchemy plan` uses. `--stage` defaults to `production`. `--days` is 1 to 3650. `--expires` is the last day it can be redeemed, in UTC, and must be a real date.

```text
vp run --filter @tranzfer/api code:create -- --code BETA-PRO --plan pro --days 90 --uses 30
vp run --filter @tranzfer/api code:create -- --code BETA-PRO --plan pro --days 90 --uses 30 --stage staging --expires 2026-12-31
vp run --filter @tranzfer/api code:list
vp run --filter @tranzfer/api code:list -- --stage staging
vp run --filter @tranzfer/api code:revoke -- --code BETA-PRO
```

`code:revoke` ends a code now by setting its `expires_at` to the database's clock. Grants already made keep their end date.

## How capacity works

Capacity is active transfer space. It isn't storage you keep, and it isn't a monthly bandwidth quota. A delivery counts against it from creation until it expires, is cancelled or is purged; then the space is free again. A Pro user can send 5 TB in a month as long as no more than 1 TB is live at once.

A new delivery that would push active space past the plan's limit is refused before any bytes upload, with copy that names the limit and the upgrade.

## Email

Tranzfer sends three emails, all from `Tranzfer <hello@tranzfer.app>` with replies to support@tranzfer.app, as plain text with a simple HTML copy:

- A welcome when an account is created, with what Free gives and how to send the first file. Better Auth's user-created hook hands it to the request's `waitUntil`, so sign-up never waits on it, and a failed send is logged and dropped.
- "You're on the list" when someone joins a plan's interest list.
- "Pro is open" (or Starter, Studio) once per person, queued by `interest:notify` above.

The API Worker sends through Cloudflare Email Sending's `send_email` binding. `tranzfer.app` is the onboarded sending domain, so any recipient works; the account quota is 1,000 a day. Logs and spans carry Cloudflare's error code, never an address.

Only production emails anyone. Staging and previews email only the addresses in `EMAIL_ALLOWLIST` (comma-separated, a GitHub variable on the staging environment) and log the rest, so test sign-ups and copied lists never reach real people. Local `alchemy dev` binds Alchemy's email simulator, which writes `.eml` files under `.alchemy/local/email` and delivers nothing. `Mail` in `apps/api/src/infrastructure/email.ts` holds the rule.

## Rate limits

Limits stop one person or bot from flooding sign-up, sign-in or the Free plan. They sit well above what a real person does, so nobody sending work should ever meet one. Over a limit, the request is refused with how long to wait, and the app says so in words. The numbers live in `rateLimits` in `packages/contracts/src/billing.ts`.

| Limit                   | Counted per | Plans | Cap                   |
| ----------------------- | ----------- | ----- | --------------------- |
| Requests to sign-in     | client IP   | all   | 30 a minute           |
| New accounts            | client IP   | all   | 10 a day              |
| New deliveries          | sender      | Free  | 20 an hour, 100 a day |
| Upload signing requests | sender      | Free  | 200 every 10 seconds  |
| Access code attempts    | user        | all   | 5 a minute            |
| Interest list sign-ups  | client IP   | all   | 10 a minute           |

Sign-in covers every `/api/auth` request, Google's start and callback and the staging login included. An IPv6 client counts by its /64. Cancelled deliveries count toward the delivery cap, so create-and-cancel can't loop. A part is at least 64 MiB, so 20 signing requests a second is faster than a gigabit line needs. Paid, comp and code-granted plans have no delivery or signing cap. Code attempts count wrong and right codes alike, so nobody can guess codes quickly.

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

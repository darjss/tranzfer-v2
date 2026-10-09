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

Every plan gets the whole product: large uploads, resume, folders, links, progress and history. Paid plans buy capacity and retention, nothing else. Don't promise teams, branding or enterprise features before they exist.

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
vp run --filter @tranzfer/api interest:notify -- --plan pro --dry-run
vp run --filter @tranzfer/api interest:notify -- --plan pro
```

Repeat for `starter` and `studio`. Like the code commands, it finds the stage's D1 through Alchemy state with your Alchemy profile's credentials, and `--stage` defaults to `production`. It prints how many on the list haven't had the email and how many it queued. It sends nothing itself: the API Worker's minute sweep sends 20 queued emails a minute and marks each `notified_at`. A send that fails is unqueued, so running the command again retries only those.

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

Tranzfer sends four emails, all from `Tranzfer <hello@tranzfer.app>`, as plain text with a simple HTML copy. Replies go to support@tranzfer.app, except on the last one:

- A welcome when an account is created, with what Free gives and how to send the first file. Better Auth's user-created hook hands it to the request's `waitUntil`, so sign-up never waits on it, and a failed send is logged and dropped.
- "You're on the list" when someone joins a plan's interest list.
- "Pro is open" (or Starter, Studio) once per person, queued by `interest:notify` above.
- A sender's own delivery link, from "Email it" on the finished-send card. The subject is "<sender name> sent you <title>" and Reply-To is the sender's account email. The body has the note, file count, size, the expiry in UTC and the link. No tracking pixel, and the sender's text is escaped in the HTML.

### Emailing a delivery

`SendDeliveryEmail` takes a ready, unexpired delivery you own and 1 to 10 addresses, and sends one email per distinct address. It answers at once with a `queued` row per address. The mail goes out in the Worker's `waitUntil`, and each row settles to `sent` or `failed`. `DeliveryEmails` reads them back, and the page polls every 2 seconds until none is queued.

`sent` means Cloudflare took the message. Nothing says it reached an inbox, and the card says so. The card says "bounced" only for `E_RECIPIENT_SUPPRESSED`, Cloudflare's code for an address it has on its bounce list. Staging and previews report an address off the allowlist as `failed` with code `held`.

`delivery_email` holds delivery id, status, error code and the times. It does not hold the address, because the send runs with the address in memory and the sender's page already knows what it typed. A row still `queued` after 10 minutes lost its isolate, and the sweep marks it `failed` with code `lost`.

The API Worker sends through Cloudflare Email Sending's `send_email` binding. `tranzfer.app` is the onboarded sending domain, so any recipient works; the account quota is 1,000 a day. Logs and spans carry Cloudflare's error code, never an address.

Only production emails anyone. Staging and previews email only the addresses in `EMAIL_ALLOWLIST` (comma-separated, a GitHub variable on the staging environment) and log the rest, so test sign-ups and copied lists never reach real people. Local `alchemy dev` binds Alchemy's email simulator, which writes `.eml` files under `.alchemy/local/email` and delivers nothing. `Mail` in `apps/api/src/infrastructure/email.ts` holds the rule.

## File requests

A file request is a link a signed-in user hands to someone without an account. The uploader opens `/r/<token>`, sees the owner's name, the request's title and instructions, types their own name (required) and an email (optional), picks files or a folder, and uploads into the owner's space. It is the receiving side of a delivery, not a drive: no branding, no custom form fields, no integrations.

The owner sets a title (up to 120 characters), instructions (up to 1,000), how long it stays open (1, 3, 7 or 14 days, within the plan's link lifetime) and an optional size cap for everything the link receives. Making one needs no plan; Free has it. The dashboard lists them with uploads and bytes received, a Copy link button, and Close.

- Each upload session is one delivery owned by the request's owner, titled "<request title> from <uploader name>". It lands on the owner's board like any delivery, can be shared, edited or cancelled, and shows who sent it. It is kept for the request's days after it finishes, or the plan's maximum if the plan has dropped since.
- It counts against the owner's active transfer space, and the Free plan's delivery caps count it too. The uploader is never told how much space the owner has. When the owner's space or the request's size cap has no room, the create is refused before any byte moves, and the uploader reads "no room" with no numbers.
- The check is part of the statement that inserts the delivery: the owner's limits, the request being open and unexpired, and the cap (the declared bytes of the request's deliveries that weren't cancelled) all hold when uploads race. Like every delivery, declared sizes are checked at finalize, not while bytes move.
- The token is `<request id>.<hmac>`, signed with the link-token key. The id is random and 16 bytes, so a request token never opens a delivery link and the reverse. Closing sets `closed_at`, expiry passes `expires_at`, and either makes the token read as unknown on every call, signing and finalizing included. Uploads already in stay on the owner's board. Transfers already waiting to finish still finish through the sweeper.
- An uploader can reach only deliveries of their request that they name by id. Ids are random and the browser keeps them, so another uploader through the same link sees nothing of theirs. The uploader never receives the owner's delivery link.
- Uploads use the same engine and resume guarantees as the owner's: refresh recovery, fingerprint and part checks on re-pick, Web Locks between tabs. The browser records the delivery ids, and on reload it reads them back through the token and asks for the same files again.
- The uploader has no account, so there is no cancel for them. The owner can cancel from the board, and an upload left open for 7 days ends like any other.

Rate limits for the uploader's calls are in the table below. They hold for every owner, paid or not, because the uploader's IP and the request are what they count.

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
| Delivery email requests | sender      | all   | 10 a minute           |
| Delivery emails         | sender      | all   | 50 a day              |
| Delivery emails         | all senders | all   | 800 a day             |
| Link password attempts  | client IP   | all   | 10 a minute           |
| Link password attempts  | link        | all   | 5 a minute            |
| File request calls      | client IP   | all   | 600 a minute          |
| File request calls      | request     | all   | 1,200 a minute        |
| New file request upload | client IP   | all   | 10 a minute           |

Sign-in covers every `/api/auth` request, Google's start and callback and the staging login included. An IPv6 client counts by its /64. Cancelled deliveries count toward the delivery cap, so create-and-cancel can't loop. A part is at least 64 MiB, so 20 signing requests a second is faster than a gigabit line needs. Every call an uploader makes through a request link counts, bad tokens included, so tokens can't be guessed quickly; signing through a request spends those limits and never the owner's own signing rate. Paid, comp and code-granted plans have no delivery or signing cap. Code attempts count wrong and right codes alike, so nobody can guess codes quickly. Password attempts count the same way, so a link takes at most 7,200 guesses a day however many networks they come from. A delivery email counts per address, failed ones included, and a send needing more room than is left is refused whole. The account-wide 800 a day keeps delivery emails under Cloudflare's 1,000 a day quota and leaves room for the welcome and interest emails.

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

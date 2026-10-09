---
title: WeTransfer file too big? What the limits are and what to do
description: WeTransfer file too big? The real limits per plan, why a file gets refused, and your options in order, from splitting to upgrading to another tool.
summary: WeTransfer counts a 30-day total, not just file size. The real limits per plan and what to do when your file is over them.
answer: If WeTransfer says your file is too big, you've hit your plan's allowance, which on Free is 3 GB or 10 transfers in any rolling 30 days and on Starter is 300 GB or 10 transfers. Ultimate takes up to 1 TB per transfer. Above that, or if you don't want a subscription for one job, use a transfer tool that sizes plans by what's live at once.
section: problems
order: 10
updated: 2026-10-09
related:
  - { href: /alternatives/wetransfer, label: WeTransfer alternatives }
  - { href: /guides/how-to-send-large-files, label: How to send large files }
  - { href: /guides/resume-an-interrupted-upload, label: Resume an interrupted upload }
  - { href: /tools/upload-time-calculator, label: Upload time calculator }
  - { href: /pricing, label: Tranzfer pricing }
faq:
  - q: What is the WeTransfer free limit?
    a: WeTransfer's plan limits page says Free lets you send up to 10 transfers or 3 GB total in any rolling 30-day window. One 3 GB file uses the whole month.
  - q: Does splitting a file get around the WeTransfer limit?
    a: Not on Free or Starter. Both limits are 30-day totals, so five small transfers count the same as one big one. Splitting only helps when one transfer would be over Ultimate's 1 TB.
  - q: How long do WeTransfer links last?
    a: Up to 3 days on Free and Starter. On Ultimate you can keep transfers active for as long as you like.
  - q: Can I send 20 GB for free?
    a: Not on WeTransfer Free, which allows 3 GB in 30 days. Tranzfer Free holds 20 GB live at once with links up to 3 days, and the space comes back when a link expires or you cancel it.
---

## How big a transfer does each WeTransfer plan allow?

WeTransfer's [plan limits page](https://wetransfer.com/help-center/subscriptions/plan-limits), last updated 30 May 2026, sets the limits as totals over a rolling 30 days, not per file. Link lifetimes come from their page on [transfer availability](https://wetransfer.com/help-center/how-to/transfer-availability).

| Plan     | What you can send                                   | How long the link lasts |
| -------- | --------------------------------------------------- | ----------------------- |
| Free     | 10 transfers or 3 GB total in any rolling 30 days   | Up to 3 days            |
| Starter  | 10 transfers or 300 GB total in any rolling 30 days | Up to 3 days            |
| Ultimate | Unlimited transfers, up to 1 TB per transfer        | As long as you like     |
| Teams    | Everything in Ultimate, storage up to 5 TB          | As long as you like     |

Two caveats. WeTransfer's [pricing page](https://wetransfer.com/pricing) says Ultimate has no limits on transfer size, which disagrees with the 1 TB on the plan limits page. We'd plan around 1 TB. And the pricing page only shows prices after you sign in, so we can't quote them here.

## What does "too big" actually mean?

It means the transfer won't fit in what's left of your 30-day allowance. That's a different problem from a file that's simply huge. On Free, a 2 GB file goes through on Monday, and a 1.5 GB file on Wednesday doesn't, because together they pass 3 GB. The allowance comes back as old transfers fall out of the 30-day window, not on the first of the month.

WeTransfer's help pages don't publish the exact wording of the error, so go by the numbers. To see what you have left, hover over your account email in the top right, or open the Transfers tab and check Sent. Since November 2024 [every sender needs an account](https://wetransfer.com/help-center/accounts/why-account-needed-to-send), even on Free.

## What are my options, in order?

1. **Split the files.** This helps less than people hope. On Free and Starter the cap is a total, so three transfers of 1 GB count the same as one of 3 GB. Splitting is useful in one case only, a single delivery over Ultimate's 1 TB. Zipping won't help either. Video, RAW photos and compressed audio barely shrink.
2. **Wait or upgrade.** If you're just over, waiting for an old transfer to age out of the window is free. Otherwise Starter lifts the total to 300 GB in 30 days, still capped at 10 transfers and 3-day links. Ultimate drops the transfer count and allows 1 TB per transfer.
3. **Use another tool.** If you send big files once in a while, a monthly WeTransfer plan for a single job is poor value. The [WeTransfer alternatives](/alternatives/wetransfer) page ranks the options with prices and sources.

## Will a big WeTransfer upload finish?

Size isn't the only risk. WeTransfer's [upload troubleshooting page](https://wetransfer.com/help-center/troubleshooting/upload-fails-error) says sleep mode cancels an upload, warns about a known Safari issue where uploads hang anywhere between 0% and 99%, and tells you not to move, rename or edit files after selecting them. It suggests restarting your computer and router for stalls. It says nothing about resuming an upload that stopped.

That matters at Starter sizes. 300 GB on a 50 Mbps upload takes 13 hours 20 minutes with the line flat out, and closer to 17 hours at a realistic 80%. Run your own numbers in the [upload time calculator](/tools/upload-time-calculator). Our guide to [resuming an interrupted upload](/guides/resume-an-interrupted-upload) covers why long uploads die near the end.

## When does Tranzfer fit?

We count capacity differently. A Tranzfer plan sets how much is live at once, not how much you send in a month. When a link expires or you cancel it, the space comes back for the next delivery. There's no separate per-file cap, so one file can be as big as the plan holds.

| Plan    | Live at once | Links last up to | Price     |
| ------- | ------------ | ---------------- | --------- |
| Free    | 20 GB        | 3 days           | $0        |
| Starter | 300 GB       | 7 days           | $15/month |
| Pro     | 1 TB         | 14 days          | $29/month |
| Studio  | 3 TB         | 14 days          | $69/month |

So a 15 GB edit that WeTransfer Free refuses goes through Tranzfer Free, and you can send another once the first link ends. Free is rate limited to 20 new deliveries an hour and 100 a day. Every plan resumes. A dropped connection retries by itself, a sleeping laptop carries on when it wakes, and after a crash or closed tab you pick the same files and only the missing parts upload. Details are on [how resume works](/features/resume).

You sign in with Google to send. The recipient opens the link and downloads, with no account and nothing to install. Folders keep their structure.

## When is WeTransfer the better pick?

- Your recipient already knows WeTransfer and the files are small. A 500 MB export doesn't need anything else.
- You want files to stay up. Ultimate keeps transfers for as long as you like and stores up to 2 TB. Tranzfer links end after 14 days at most and the files are deleted.
- You need a single delivery over 3 TB. That's the most Tranzfer holds at once, on Studio.

For the general playbook by file size, start with [how to send large files](/guides/how-to-send-large-files).

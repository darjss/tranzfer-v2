import { plans } from "@tranzfer/contracts";
import * as Schema from "effect/Schema";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { bytes } from "../dashboard/format";
import { quote } from "../marketing/prices";

// What each service says about itself, for the /alternatives pages. Every
// competitor line comes from the page in its `sources`; where their pages
// don't say, the copy says so instead of guessing. Prices reuse
// marketing/prices.ts, so the calculator on /pricing and these pages agree.

// Cents only when there are any: $15, $96.25.
const usd = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
  trailingZeroDisplay: "stripIfInteger",
});

// A typical heavy month: four 100 GB deliveries, one live at a time.
const month = quote(100, 4);
const monthCost = (id: string) => {
  const q = month.find((item) => item.id === id);
  return q?.price === undefined ? "Too big" : `${usd.format(q.price)} on ${q.plan}`;
};

export const ServiceId = Schema.Literals([
  "tranzfer",
  "masv",
  "wetransfer",
  "filemail",
  "smash",
  "dropbox",
  "drive",
  "frameio",
]);
export type ServiceId = typeof ServiceId.Type;

export const services = {
  drive: {
    bestFor: "Files that should stay put, shared with people already on Google",
    cons: [
      "It's storage, so files stay and count against your space until you delete them",
      "Workspace accounts can upload 750 GB a day; Google gives personal accounts a daily limit without a number",
      "Google doesn't document what a browser upload does after a closed tab or a dropped connection",
      "A file many people download from one public link can hit a download quota for up to 24 hours",
    ],
    expiry:
      "Links don't expire. Work and school accounts can set an end date for people added by name.",
    limit:
      "Files up to 5 TB. 15 GB of free storage per Google account, shared with Gmail and Photos.",
    month: "Depends on your storage plan",
    name: "Google Drive",
    price: "15 GB free. More through Google One or Workspace; check Google's pricing.",
    pros: [
      "Most people already have an account",
      "Handles single files up to 5 TB",
      "Anyone with the link can download without signing in",
    ],
    resume: "Not documented for browser uploads. Drive for desktop retries files later.",
    sources: [
      { href: "https://support.google.com/drive/answer/37603", label: "Drive file limits" },
      {
        href: "https://knowledge.workspace.google.com/admin/drive/storage-and-upload-limits-for-google-workspace",
        label: "Workspace upload limits",
      },
      {
        href: "https://support.google.com/drive/answer/2565956",
        label: "Drive sync and upload errors",
      },
      { href: "https://support.google.com/drive/answer/2494822", label: "Drive sharing" },
      { href: "https://support.google.com/drive/answer/2423534", label: "Drive download quota" },
      { href: "https://one.google.com/about/plans", label: "Google One plans" },
    ],
  },
  dropbox: {
    bestFor: "Sending up to 100 or 250 GB when you already pay for Dropbox",
    cons: [
      "Basic tops out at 2 GB and Plus at 50 GB a transfer",
      "Dropbox warns that browser uploads over 375 GB may time out and points you to the desktop app",
      "Their help pages don't say what happens to an interrupted Transfer upload",
    ],
    expiry: "7 days on Basic, Family and Plus. Other plans pick a date, 30 days by default.",
    limit:
      "2 GB on Basic, 50 GB on Plus, 100 GB on Essentials and Business, 250 GB on Business Plus or with the Replay add-on",
    month: "Fits Essentials or Business; see their plans",
    name: "Dropbox Transfer",
    price: "Comes with Dropbox plans. Check their plans page for the current price.",
    pros: [
      "Already there if your team lives in Dropbox",
      "Recipients don't need a Dropbox account",
      "Passwords and download counts on the business plans",
    ],
    resume: "Not stated on their Transfer help pages",
    sources: [
      { href: "https://help.dropbox.com/share/dropbox-transfer", label: "Dropbox Transfer help" },
      { href: "https://help.dropbox.com/sync/upload-limitations", label: "Dropbox upload limits" },
      { href: "https://www.dropbox.com/plans", label: "Dropbox plans" },
    ],
  },
  filemail: {
    bestFor: "People happy to install a desktop app who want files kept for good",
    cons: [
      "Resume is listed as a desktop app feature, not a browser one",
      "Free allows 2 transfers a day of up to 5 GB; Personal also stops at 5 GB a transfer and Pro at 250 GB",
      "Sending a folder from the browser needs Chrome or Opera",
    ],
    expiry: "7 days on Free, 30 days on Personal. Permanent on Pro, set by you on Business.",
    limit: "5 GB a transfer on Free and Personal, 250 GB on Pro, any size on Business",
    month: monthCost("filemail"),
    name: "Filemail",
    price: "Free, then Personal $6, Pro $14 and Business $24 a month",
    pros: [
      "Flat monthly price",
      "Desktop app that resumes interrupted transfers",
      "Files can stay up permanently on Pro",
    ],
    resume: "Desktop app only. Their pages never say a browser upload resumes.",
    sources: [
      { href: "https://www.filemail.com/price-plans-comparison", label: "Filemail plans" },
      { href: "https://www.filemail.com/apps/desktop", label: "Filemail desktop app" },
      {
        href: "https://support.filemail.com/en/articles/4103694-free-file-sharing-service",
        label: "Filemail free plan",
      },
    ],
  },
  frameio: {
    bestFor:
      "Review and approval: frame-accurate comments on cuts, with the files kept in one place",
    cons: [
      "Priced per member, and storage fills up because files stay until you delete them",
      "Free has 2 GB of storage",
      "Adobe doesn't say what a browser upload does after a closed tab; its desktop apps resume",
      "Frame.io V4 doesn't support DaVinci Resolve",
    ],
    expiry:
      "Files stay until deleted. Pro and Team can set an expiry date and passphrase on share links.",
    limit:
      "Files up to 5 TB. Storage is 2 GB on Free, 2 TB on Pro and 3 TB on Team, plus 2 TB per extra member.",
    month: "$15 on Pro for one member, and the 400 GB stays in your 2 TB until you delete it",
    name: "Frame.io",
    price: "Free for 2 GB, then Pro $15 and Team $25 per member a month",
    pros: [
      "Comments pinned to the frame, inside Premiere",
      "Share links work without an account and can offer the original file",
      "Files up to 5 TB",
    ],
    resume: "Not stated for the browser. Frame.io Drive and the Mac app resume.",
    sources: [
      { href: "https://frame.io/pricing", label: "Frame.io pricing" },
      {
        href: "https://help.frame.io/en/articles/9101026-uploading-your-media",
        label: "Frame.io uploads",
      },
      {
        href: "https://help.frame.io/en/articles/9105232-shares-in-frame-io",
        label: "Frame.io shares",
      },
      {
        href: "https://help.frame.io/en/articles/14501692-how-to-transfer-upload-download-in-frame-io-drive",
        label: "Frame.io Drive",
      },
    ],
  },
  masv: {
    bestFor: "Teams that want a desktop app and only pay when they send",
    cons: [
      "Per-GB pricing adds up. 1 TB in a month is about $246 pay as you go",
      'In the browser, "if you close your MASV browser tab or your computer crashes you will have to start over"',
      "A credit card is needed even for the free 15 GB",
    ],
    expiry: "You set it. 5 days of storage are included, then $0.07 per GB a month.",
    limit: "No cap on how much you send",
    month: monthCost("masv"),
    name: "MASV",
    price:
      "$0.25 per GB after 15 GB free each month, or annual bundles from $58 a month for 250 GB",
    pros: [
      "Desktop app recovers from most interruptions, reboots included",
      "Portals collect files from clients and can forward them to S3 or Frame.io",
      "Pay only for what you send",
    ],
    resume:
      "Retries through network drops. A closed tab or crash in the browser starts over; the desktop app recovers.",
    sources: [
      { href: "https://masv.io/pricing", label: "MASV pricing" },
      {
        href: "https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload",
        label: "MASV on interrupted uploads",
      },
      {
        href: "https://help.massive.io/en/how-to-use-a-portal-to-send-files-to-integrations",
        label: "MASV Portals",
      },
    ],
  },
  smash: {
    bestFor: "Free sends a bit bigger than WeTransfer's, with password links on every plan",
    cons: [
      "On Free, anything over 2 GB waits in a queue behind Pro transfers",
      "Their help says a stuck upload can't be restarted; you send it again from the start",
      "Their pricing page says Pro has no size limit, but their help center says 250 GB a transfer",
    ],
    expiry:
      "Up to 7 days on Free by their pricing page, 14 by their help center. Up to 30 days paid.",
    limit:
      "2 GB at full priority on Free; bigger transfers queue. Pro: unlimited or 250 GB, see above.",
    month: monthCost("smash"),
    name: "Smash",
    price: "Free, then Pro at $10 a month, or Team at $25 a month for 10 people",
    pros: [
      "No hard size cap, even on Free",
      "Password protection on Free",
      "Recipients never need an account",
    ],
    resume: "Starts over. Their help says there's no way to restart a stuck upload.",
    sources: [
      { href: "https://fromsmash.com/pricing", label: "Smash pricing" },
      {
        href: "https://fromsmash.com/help/articles/13885610-what-is-the-file-size-limit-on-smash",
        label: "Smash size limits",
      },
      {
        href: "https://fromsmash.com/help/articles/12985104-my-transfer-gets-stuck-at-100",
        label: "Smash on stuck uploads",
      },
      {
        href: "https://fromsmash.com/help/articles/12952074-how-can-i-change-the-availability-period-of-my-transfer",
        label: "Smash link expiry",
      },
    ],
  },
  tranzfer: {
    bestFor: "Hundreds of gigabytes from a browser, on a connection you don't trust",
    cons: [
      "No desktop app and no team seats yet",
      `Links last ${plans.pro.maxRetentionDays} days at most`,
      `${bytes(plans.studio.activeBytes)} live at once is the ceiling`,
      "New. Tested at 100 GB with eight failures forced on purpose, not years of production",
    ],
    expiry: `Up to ${plans.free.maxRetentionDays}, ${plans.starter.maxRetentionDays} or ${plans.pro.maxRetentionDays} days by plan, then the files are deleted`,
    limit: `${bytes(plans.free.activeBytes)} live at once on Free, up to ${bytes(plans.studio.activeBytes)} on Studio. No separate per-file cap.`,
    month: monthCost("tranzfer"),
    name: "Tranzfer",
    price: `Free, then $${plans.starter.monthlyUsd}, $${plans.pro.monthlyUsd} or $${plans.studio.monthlyUsd} a month, flat`,
    pros: [
      "Every plan resumes, Free included",
      "Flat monthly price, not per GB",
      "Folders arrive sorted; desktop Chrome and Edge save a whole delivery into one folder",
    ],
    resume:
      "Retries after a drop and carries on after sleep. After a crash or closed tab, pick the same files and only the missing parts upload.",
    sources: [
      { href: "/pricing", label: "Tranzfer pricing" },
      { href: "/features/resume", label: "How resume works" },
    ],
  },
  wetransfer: {
    bestFor: "A few gigabytes to someone who already expects a WeTransfer link",
    cons: [
      "Free allows 10 transfers or 3 GB in 30 days, Starter 10 transfers or 300 GB",
      "Free and Starter links last 3 days at most",
      "Their troubleshooting page says sleep mode cancels an upload; resuming isn't mentioned",
      "Senders need an account; prices are only shown after you sign in",
    ],
    expiry: "Up to 3 days on Free and Starter. Ultimate keeps transfers up as long as you like.",
    limit:
      "Free: 10 transfers or 3 GB per 30 days. Starter: 10 transfers or 300 GB per 30 days. Ultimate: up to 1 TB a transfer by their help center.",
    month: "Over Starter's 300 GB, so Ultimate; see their pricing",
    name: "WeTransfer",
    price: "Free, then Starter, Ultimate and Teams. Prices show after you sign in.",
    pros: ["Everyone knows the name", "Ultimate takes up to 1 TB in one transfer"],
    resume:
      "Not mentioned. Their help asks for a stable connection and says sleep mode cancels the upload.",
    sources: [
      {
        href: "https://wetransfer.com/help-center/subscriptions/plan-limits",
        label: "WeTransfer plan limits",
      },
      {
        href: "https://wetransfer.com/help-center/how-to/transfer-availability",
        label: "WeTransfer link expiry",
      },
      {
        href: "https://wetransfer.com/help-center/troubleshooting/upload-fails-error",
        label: "WeTransfer upload troubleshooting",
      },
    ],
  },
};

/** The side-by-side table, in ranked order. */
export function CompareTable(props: { readonly ids: readonly ServiceId[] }) {
  return (
    <div>
      <table class={css({ minW: "[960px]" })}>
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">Best for</th>
            <th scope="col">Price</th>
            <th scope="col">How big</th>
            <th scope="col">Interrupted upload</th>
            <th scope="col">4 × 100 GB a month</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.ids}>
            {(id) => (
              <tr>
                <th scope="row">
                  {id === "tranzfer" ? <strong>{services[id].name}</strong> : services[id].name}
                </th>
                <td>{services[id].bestFor}</td>
                <td>{services[id].price}</td>
                <td>{services[id].limit}</td>
                <td>{services[id].resume}</td>
                <td>{services[id].month}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

const tag = css({
  color: "mut",
  fontFamily: "mono",
  fontSize: "11",
  letterSpacing: "widest",
  textTransform: "uppercase",
});

/** One block per service: best for, price, limits, pros, cons and sources. */
export function Ranked(props: { readonly ids: readonly ServiceId[] }) {
  return (
    <div>
      <For each={props.ids}>
        {(id, i) => (
          <div class={css({ borderColor: "line", borderTopWidth: "1px", mt: "8" })} id={id}>
            <h3>
              {i() + 1}. {services[id].name}
            </h3>
            <p>
              <span class={tag}>Best for</span> {services[id].bestFor}.
            </p>
            <dl
              class={css({
                "& dd": { mt: "0.5" },
                "& dt": { color: "ink", fontWeight: "semibold" },
                display: "grid",
                gap: "4",
                gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" },
                maxW: "[880px]",
                mt: "4",
              })}
            >
              <div>
                <dt>Price</dt>
                <dd>{services[id].price}</dd>
              </div>
              <div>
                <dt>How big</dt>
                <dd>{services[id].limit}</dd>
              </div>
              <div>
                <dt>If the upload is interrupted</dt>
                <dd>{services[id].resume}</dd>
              </div>
              <div>
                <dt>How long links last</dt>
                <dd>{services[id].expiry}</dd>
              </div>
            </dl>
            <div
              class={css({
                display: "grid",
                gap: "4",
                gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" },
                maxW: "[880px]",
                mt: "5",
              })}
            >
              <div>
                <p class={cx(tag, css({ color: "ok" }))}>Good</p>
                <ul>
                  <For each={services[id].pros}>{(pro) => <li>{pro}</li>}</For>
                </ul>
              </div>
              <div>
                <p class={cx(tag, css({ color: "rust" }))}>Watch out</p>
                <ul>
                  <For each={services[id].cons}>{(con) => <li>{con}</li>}</For>
                </ul>
              </div>
            </div>
            <p class={css({ color: "mut", fontSize: "15" })}>
              Sources:{" "}
              <For each={services[id].sources}>
                {(source, n) => (
                  <>
                    {n() > 0 ? ", " : ""}
                    <a
                      href={source.href}
                      rel={source.href.startsWith("/") ? undefined : "nofollow noopener"}
                    >
                      {source.label}
                    </a>
                  </>
                )}
              </For>
            </p>
          </div>
        )}
      </For>
    </div>
  );
}

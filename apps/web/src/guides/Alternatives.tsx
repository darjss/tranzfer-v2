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
]);
export type ServiceId = typeof ServiceId.Type;

export const services = {
  drive: {
    bestFor: "Files that should stay put, shared with people already on Google",
    cons: [
      "It's storage, so files stay and count against your space until you delete them",
      "Workspace accounts can upload 750 GB a day",
      "Google doesn't document what a browser upload does after a closed tab",
    ],
    expiry: "Links don't expire unless you set it up. Files stay until you delete them.",
    limit: "Files up to 5 TB. 15 GB of free storage per Google account.",
    month: "Depends on your storage plan",
    name: "Google Drive",
    price: "15 GB free. More through Google One or Workspace; check Google's pricing.",
    pros: ["Most people already have an account", "Handles single files up to 5 TB"],
    resume: "Not documented for browser uploads",
    sources: [
      { href: "https://support.google.com/drive/answer/37603", label: "Drive file limits" },
      {
        href: "https://developers.google.com/drive/api/guides/limits",
        label: "Drive upload limits",
      },
      { href: "https://one.google.com/about/plans", label: "Google One plans" },
    ],
  },
  dropbox: {
    bestFor: "Sending up to 100 GB when you already pay for Dropbox",
    cons: [
      "Basic tops out at 2 GB and Plus at 50 GB a transfer",
      "Their Transfer help page doesn't say what happens to an interrupted upload",
    ],
    expiry: "7 days on Basic and Plus. Essentials and Business pick a date, 30 days by default.",
    limit:
      "2 GB on Basic, 50 GB on Plus, 100 GB on Essentials and Business, 250 GB with the Replay add-on",
    month: "Fits Essentials or Business; see their plans",
    name: "Dropbox Transfer",
    price: "Comes with Dropbox plans. Check their plans page for the current price.",
    pros: [
      "Already there if your team lives in Dropbox",
      "Recipients don't need a Dropbox account",
    ],
    resume: "Not stated on their Transfer help page",
    sources: [
      { href: "https://help.dropbox.com/share/dropbox-transfer", label: "Dropbox Transfer help" },
      { href: "https://www.dropbox.com/plans", label: "Dropbox plans" },
    ],
  },
  filemail: {
    bestFor: "People happy to install a desktop app who want files kept for good",
    cons: [
      "Resume is listed as a desktop app feature, not a browser one",
      "Personal stops at 5 GB a transfer and Pro at 250 GB",
    ],
    expiry: "30 days on Personal. Permanent on Pro and Business.",
    limit: "5 GB a transfer on Free and Personal, 250 GB on Pro, any size on Business",
    month: monthCost("filemail"),
    name: "Filemail",
    price: "Free, then Personal $6, Pro $14 and Business $24 a month",
    pros: [
      "Flat monthly price",
      "Desktop app that resumes interrupted transfers",
      "Files can stay up permanently on Pro",
    ],
    resume: "Listed as a desktop app feature on paid plans",
    sources: [
      {
        href: "https://www.filemail.com/price-plans-comparison",
        label: "Filemail plans",
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
      { href: "https://masv.io/feature/file-portals", label: "MASV Portals" },
    ],
  },
  smash: {
    bestFor: "Free sends a bit bigger than WeTransfer's, with week-long links",
    cons: [
      "On Free, anything over 2 GB waits in a queue behind Pro transfers",
      "Their site doesn't say what happens to an interrupted upload",
    ],
    expiry: "7 days on Free, 30 days on Pro",
    limit: "2 GB at full priority on Free; bigger transfers queue. No size limit on Pro.",
    month: monthCost("smash"),
    name: "Smash",
    price: "Free, then Pro at $10 a month",
    pros: ["No hard size cap, even on Free", "Cheap Pro plan with 30-day links"],
    resume: "Not stated on their site",
    sources: [{ href: "https://fromsmash.com/pricing", label: "Smash pricing" }],
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
      "Free allows 10 transfers or 3 GB in 30 days",
      "Starter allows 300 GB in 30 days",
      "Their troubleshooting page asks you to keep the device awake; resuming isn't mentioned",
    ],
    expiry: "Up to 3 days on Free. Ultimate lets you set your own.",
    limit:
      "Free: 10 transfers or 3 GB per 30 days. Starter: 300 GB per 30 days. Ultimate: up to 1 TB a transfer.",
    month: "Over Starter's 300 GB, so Ultimate; see their pricing",
    name: "WeTransfer",
    price: "Free, then Starter, Ultimate and Teams. Check their pricing page for current prices.",
    pros: ["Everyone knows the name", "Ultimate takes up to 1 TB in one transfer"],
    resume: "Not mentioned; their help asks for a stable connection and no sleep mode",
    sources: [
      {
        href: "https://wetransfer.com/help-center/subscriptions/plan-limits",
        label: "WeTransfer plan limits",
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

import { plans } from "@tranzfer/contracts";
import ComparePage from "../../compare/ComparePage";
import { bytes } from "../../dashboard/format";

const masvHelp =
  "https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload";

export default function VsMasv() {
  return (
    <ComparePage
      checked="8 October 2026"
      description="Tranzfer vs MASV for sending large video files: flat monthly plans vs per-GB pricing, and what happens when the browser tab closes mid-upload."
      intro={
        <p>
          MASV and Tranzfer both move very large media files from the browser to people who don't
          need an account. The differences are how you pay and what happens when the tab closes.
          MASV charges per gigabyte. Tranzfer charges a flat monthly plan for the space your live
          deliveries take up, and resumes an upload after a closed tab or a crash.
        </p>
      }
      path="/vs/masv"
      rows={[
        {
          ours: `Flat monthly plans: Free, then $${plans.starter.monthlyUsd}, $${plans.pro.monthlyUsd} or $${plans.studio.monthlyUsd} a month. No per-GB fee.`,
          source: "https://masv.io/pricing",
          theirs:
            "Per GB: $0.25/GB pay as you go with the first 15 GB free each month, or annual bundles from $58/month for 250 GB to $410/month for 2 TB.",
          topic: "Pricing",
        },
        {
          ours: `Pro, $${plans.pro.monthlyUsd}/month, as long as no more than ${bytes(plans.pro.activeBytes)} is live at once. Space frees up as deliveries end.`,
          source: "https://masv.io/pricing",
          theirs: "About $246 pay as you go, or $215/month on the 1 TB annual bundle.",
          topic: "Sending 1 TB in a month",
        },
        {
          ours: "Waits for the connection and retries only the parts in flight.",
          source: masvHelp,
          theirs: "Retries until the connection comes back and continues.",
          topic: "Network drops",
        },
        {
          ours: "Resumes. Pick the same files again; Tranzfer checks them against what arrived and sends only what's missing.",
          source: masvHelp,
          theirs:
            'In the browser: "if you close your MASV browser tab or your computer crashes you will have to start over." Their desktop app recovers from most interruptions.',
          topic: "Closed tab or crash",
        },
        {
          ours: "No account needed.",
          source: "https://help.massive.io/en/do-i-have-to-sign-up-sign-in-to-download-files",
          theirs: "No account needed, unless the sender adds restrictions.",
          topic: "Recipients",
        },
        {
          ours: "Kept. In Chrome and Edge, Download all saves everything into one folder with its subfolders.",
          source: "https://help.massive.io/en/how-to-send-files-using-masv",
          theirs: "Kept.",
          topic: "Folders",
        },
        {
          ours: `Up to ${plans.free.maxRetentionDays}, ${plans.starter.maxRetentionDays} or ${plans.pro.maxRetentionDays} days by plan, then the files are deleted.`,
          source: "https://masv.io/pricing",
          theirs:
            "You set the expiry. 5 days of storage per file are included, then a storage fee per GB.",
          topic: "How long links last",
        },
      ]}
      them="MASV"
      theyFit={[
        "You need a desktop app, portals for clients to upload to you, or enterprise integrations.",
        "Your packages are bigger than Tranzfer's largest plan, 3 TB of live deliveries.",
        "You send rarely, and paying for gigabytes used is cheaper than any monthly plan.",
      ]}
      title="A flat plan, and uploads that survive a closed tab"
    />
  );
}

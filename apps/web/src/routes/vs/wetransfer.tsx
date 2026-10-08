import { plans } from "@tranzfer/contracts";
import ComparePage from "../../compare/ComparePage";
import { bytes } from "../../dashboard/format";

const limits = "https://wetransfer.com/help-center/subscriptions/plan-limits";

export default function VsWeTransfer() {
  return (
    <ComparePage
      checked="8 October 2026"
      description="Tranzfer vs WeTransfer for big video deliveries: how much the free plans send, and what happens when the Wi-Fi drops or the laptop sleeps."
      intro={
        <p>
          WeTransfer is the name everyone knows for sending files. Tranzfer is built for the
          deliveries that are too big to babysit: hundreds of gigabytes of footage that has to
          survive a dropped connection, a sleeping laptop or a crashed browser.
        </p>
      }
      path="/vs/wetransfer"
      rows={[
        {
          ours: `${bytes(plans.free.activeBytes)} of live deliveries at once, as many sends as you like. Space frees up when a link ends.`,
          source: limits,
          theirs: "10 transfers or 3 GB in a rolling 30-day window.",
          topic: "Free plan",
        },
        {
          ours: `Up to ${plans.free.maxRetentionDays} days.`,
          source: "https://wetransfer.com/resources/send-large-files/send-files-over-2gb",
          theirs: "Up to 3 days.",
          topic: "Free links last",
        },
        {
          ours: `Starter, $${plans.starter.monthlyUsd}/month: ${bytes(plans.starter.activeBytes)} live at once, no cap on how many you send.`,
          source: limits,
          theirs: "Starter: 10 transfers or 300 GB in a rolling 30-day window.",
          topic: "First paid plan",
        },
        {
          ours: "Keeps every part that arrived and carries on, after a drop, a sleep, a reload or a crash. Tested on a 100 GB upload before every release.",
          source: "https://wetransfer.com/help-center/troubleshooting/upload-fails-error",
          theirs:
            "Their troubleshooting page asks for a stable connection and a device that doesn't go into sleep mode. Resuming isn't mentioned.",
          topic: "Wi-Fi drops or laptop sleeps",
        },
        {
          ours: "No account needed.",
          source: "https://wetransfer.com/resources/send-large-files/send-files-over-2gb",
          theirs: "No account needed.",
          topic: "Recipients",
        },
      ]}
      them="WeTransfer"
      theyFit={[
        "You want links that stay up indefinitely; their Ultimate plan allows any expiry.",
        "Your recipients already expect a WeTransfer link and you send a few gigabytes at a time.",
        "You need team storage beyond Tranzfer's largest plan.",
      ]}
      title="For the transfers too big to babysit"
    />
  );
}

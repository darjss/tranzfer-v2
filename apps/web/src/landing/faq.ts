import { PlanId, plans } from "@tranzfer/contracts";
import { bytes } from "../dashboard/format";

// One source for the landing FAQ, its FAQPage JSON-LD and /llms.txt. Plan
// numbers come from the catalog so the answers can't drift from pricing.

const paid = PlanId.literals.filter((id) => id !== "free");

export const faq = [
  {
    a: `As big as your plan holds at once: ${bytes(plans.free.activeBytes)} on Free, up to ${bytes(plans.studio.activeBytes)} on Studio. No separate limit per file. We've tested it with a single 100 GB upload, with eight things broken on purpose.`,
    q: "How big a file can I send?",
  },
  {
    a: "Nothing you already sent is lost. When the connection comes back, Tranzfer carries on by itself. After a sleep, a reload or a crash, pick the same files again; it checks them against what arrived and sends only what's missing.",
    q: "What happens if my Wi-Fi drops or my laptop sleeps?",
  },
  {
    a: "No. They open the link and download. No sign-up, no app.",
    q: "Does the person I'm sending to need an account?",
  },
  {
    a: `You pick 1, 3, 7 or 14 days, up to your plan's limit: ${PlanId.literals
      .map((id) => `${plans[id].maxRetentionDays} on ${plans[id].name}`)
      .join(", ")}. When a link ends, its files are deleted.`,
    q: "How long do links last?",
  },
  {
    a: "Yes. Choose a folder and Tranzfer uploads everything in it, subfolders and file names included.",
    q: "Can I send a whole folder?",
  },
  {
    a: `Free gives you ${bytes(plans.free.activeBytes)} of active transfer space. ${paid
      .map(
        (id) =>
          `${plans[id].name} is $${plans[id].monthlyUsd} a month for ${bytes(plans[id].activeBytes)}`,
      )
      .join(
        ", ",
      )}. Space frees up as deliveries end, so there's no monthly cap on how much you send.`,
    q: "How much does it cost?",
  },
  {
    a: "Your files are encrypted on the way and while they're stored. Only someone with the link can download them, and they're deleted when the link ends or you cancel it.",
    q: "Are my files private?",
  },
];

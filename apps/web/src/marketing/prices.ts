import { PlanId, plans } from "@tranzfer/contracts";

// Monthly cost of sending `count` deliveries of `sizeGb` each, per service,
// with `live` of them still downloadable at the same time.
// Competitor numbers are their published USD prices on monthly billing,
// checked 8 October 2026 (sources below). Pure, so the page and its test share
// one set of rules.

export const checked = "8 October 2026";

export interface Quote {
  readonly id: string;
  readonly name: string;
  /** Monthly USD, or undefined when the service can't take a delivery this big. */
  readonly price: number | undefined;
  readonly plan: string;
  /** What happens to a browser upload when the tab closes or the laptop crashes. */
  readonly resume: string;
  readonly source: string;
}

const GB = 1_000_000_000;

// Filemail's plans by the largest transfer each allows.
const filemailTiers = [
  { maxGb: 5, plan: "Personal", price: 6 },
  { maxGb: 250, plan: "Pro", price: 14 },
  { maxGb: Infinity, plan: "Business", price: 24 },
];

export const quote = (sizeGb: number, count: number, live = 1): readonly Quote[] => {
  const totalGb = sizeGb * count;
  const filemail = filemailTiers.find((tier) => sizeGb <= tier.maxGb) ?? filemailTiers[2];
  // Tranzfer counts every live link against the plan, so overlap needs room.
  const tranzfer = PlanId.literals.find((id) => plans[id].activeBytes >= sizeGb * live * GB);
  return [
    {
      id: "tranzfer",
      name: "Tranzfer",
      plan: tranzfer === undefined ? "Over 3 TB at once" : plans[tranzfer].name,
      price: tranzfer === undefined ? undefined : plans[tranzfer].monthlyUsd,
      resume: "Picks up after a closed tab in the browser",
      source: "/#pricing",
    },
    {
      id: "masv",
      name: "MASV",
      plan: "Pay as you go",
      price: Math.max(0, totalGb - 15) * 0.25,
      resume: "Starts over after a closed tab in the browser",
      source: "https://masv.io/pricing",
    },
    {
      id: "smash",
      name: "Smash",
      plan: sizeGb <= 2 ? "Free" : "Pro",
      price: sizeGb <= 2 ? 0 : 10,
      resume: "Starts over after a closed tab or crash",
      source: "https://fromsmash.com/pricing",
    },
    {
      id: "filemail",
      name: "Filemail",
      plan: filemail.plan,
      price: filemail.price,
      resume: "Recovery only in its desktop app",
      source: "https://www.filemail.com/price-plans-comparison",
    },
  ];
};

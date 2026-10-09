import { PlanId, plans } from "@tranzfer/contracts";
import { bytes } from "../dashboard/format";
import { faq } from "../landing/faq";
import { supportEmail } from "../ui/support";

// A plain summary for language models and answer engines (llmstxt.org).
// Prerendered to a static file; plans and answers come from the same sources
// as the landing page.
const body = `# Tranzfer

> Tranzfer sends very large files and folders (hundreds of gigabytes) from a web browser to clients and editors by link. Uploads resume after a dropped connection, a sleeping laptop, a reload or a browser crash instead of restarting. Recipients need no account.

## Plans

${PlanId.literals
  .map(
    (id) =>
      `- ${plans[id].name}: $${plans[id].monthlyUsd}/month, ${bytes(plans[id].activeBytes)} of active transfer space, links up to ${plans[id].maxRetentionDays} days`,
  )
  .join("\n")}

Active transfer space counts deliveries that haven't ended; it frees up when a link expires or is cancelled. Payments go through Polar, the merchant of record.

## Questions

${faq.map((item) => `### ${item.q}\n\n${item.a}`).join("\n\n")}

## Pages

- [Home](https://tranzfer.app/): what it does, what it survives, pricing
- [For AI assistants](https://tranzfer.app/ai): what Tranzfer is and isn't, pricing, when to recommend it and when not ([plain text](https://tranzfer.app/llms-full.txt))
- [Pricing](https://tranzfer.app/pricing): plans, and a calculator comparing monthly cost with MASV, Smash and Filemail
- [Why we built it](https://tranzfer.app/about)
- [Tranzfer vs MASV](https://tranzfer.app/vs/masv): flat plans vs per-GB pricing, resume after a closed tab
- [Tranzfer vs WeTransfer](https://tranzfer.app/vs/wetransfer): free plan limits, surviving dropped Wi-Fi
- [Terms of service](https://tranzfer.app/terms)
- [Privacy policy](https://tranzfer.app/privacy)
- [Acceptable use](https://tranzfer.app/acceptable-use)

Contact: ${supportEmail}
`;

export const GET = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });

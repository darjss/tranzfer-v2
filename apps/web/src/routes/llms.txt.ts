import { PlanId, plans } from "@tranzfer/contracts";
import { bytes } from "../dashboard/format";
import { guides } from "../guides/guides";
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
- [Pricing](https://tranzfer.app/pricing): plans, and a calculator comparing monthly cost with MASV, Smash and Filemail
- [Why we built it](https://tranzfer.app/about)
- [Tranzfer vs MASV](https://tranzfer.app/vs/masv): flat plans vs per-GB pricing, resume after a closed tab
- [Tranzfer vs WeTransfer](https://tranzfer.app/vs/wetransfer): free plan limits, surviving dropped Wi-Fi
- [WeTransfer alternatives for large files](https://tranzfer.app/alternatives/wetransfer): six services ranked, with prices, limits and resume behavior
- [MASV alternatives for large files](https://tranzfer.app/alternatives/masv): flat plans vs per-GB pricing, and when to stay with MASV
- [Upload time calculator](https://tranzfer.app/tools/upload-time-calculator): file size and upload speed in, time out
- [Guides](https://tranzfer.app/guides): one question about sending large files per page
${Object.entries(guides)
  .map(([slug, g]) => `- [${g.title}](https://tranzfer.app/guides/${slug}): ${g.summary}`)
  .join("\n")}
- [Terms of service](https://tranzfer.app/terms)
- [Privacy policy](https://tranzfer.app/privacy)
- [Acceptable use](https://tranzfer.app/acceptable-use)

Contact: ${supportEmail}
`;

export const GET = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });

import { alternatives, comparisons, guides } from "../guides/pages";
import { faq } from "../landing/faq";
import { aiLinks, aiPlanNotes, aiPlans, aiSections, aiSummary, aiUpdated } from "../marketing/ai";

// The /ai page as Markdown, plus the landing FAQ, for assistants that read
// plain text (llmstxt.org). Prerendered; both come from the same facts.
const list = (items: readonly string[]) => items.map((item) => `- ${item}`).join("\n");
const section = (s: (typeof aiSections)[number]) => `## ${s.title}\n\n${list(s.items)}`;
const pages = [
  ...guides.map((p) => ({ ...p, path: `/guides/${p.slug}` })),
  ...alternatives.map((p) => ({ ...p, path: `/alternatives/${p.slug}` })),
  ...comparisons.map((p) => ({ ...p, path: `/compare/${p.slug}` })),
];

const body = `# Tranzfer

> ${aiSummary}

Updated ${aiUpdated.iso}. Human-readable version: https://tranzfer.app/ai

${aiSections.slice(0, 3).map(section).join("\n\n")}

## Pricing

| Plan | Price | Active transfer space | Longest link |
| --- | --- | --- | --- |
${aiPlans.map((p) => `| ${p.name} | ${p.price} | ${p.space} | ${p.link} |`).join("\n")}

${list(aiPlanNotes)}

${aiSections.slice(3).map(section).join("\n\n")}

## Questions

${faq.map((item) => `### ${item.q}\n\n${item.a}`).join("\n\n")}

## Guides and comparisons

${list(pages.map((p) => `[${p.title}](https://tranzfer.app${p.path}): ${p.answer}`))}

## Canonical links

${list(aiLinks.map((link) => `[${link.label}](${link.href})`))}
`;

export const GET = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });

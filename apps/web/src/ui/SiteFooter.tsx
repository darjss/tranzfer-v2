import { For } from "solid-js";
import { css } from "styled-system/css";
import Brand from "../landing/Brand";
import { alternatives, comparisons } from "../guides/pages";
import { audiences, features } from "../marketing/content";
import { supportEmail } from "./support";

const columns = [
  {
    links: [
      ...features.map((f) => ({ href: `/features/${f.slug}`, label: f.menu })),
      { href: "/pricing", label: "Pricing" },
    ],
    title: "Product",
  },
  {
    links: audiences.map((a) => ({ href: `/for/${a.slug}`, label: a.menu })),
    title: "Use cases",
  },
  {
    links: [
      { href: "/guides", label: "Guides" },
      { href: "/tools/upload-time-calculator", label: "Upload time calculator" },
      { href: "/#faq", label: "Questions" },
      { href: "/about", label: "Why we built it" },
      { href: "/ai", label: "For AI assistants" },
      { href: `mailto:${supportEmail}`, label: supportEmail },
      { href: `mailto:${supportEmail}?subject=Abuse%20report`, label: "Report a link" },
    ],
    title: "Resources",
  },
  {
    links: [
      { href: "/vs/masv", label: "Tranzfer vs MASV" },
      { href: "/vs/wetransfer", label: "Tranzfer vs WeTransfer" },
      ...comparisons.map((page) => ({ href: `/compare/${page.slug}`, label: page.title })),
      ...alternatives.map((page) => ({
        href: `/alternatives/${page.slug}`,
        label: page.title.replace(/ for .*$/u, ""),
      })),
    ],
    title: "Compare",
  },
  {
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/acceptable-use", label: "Acceptable use" },
    ],
    title: "Legal",
  },
];

const label = css({
  color: "mut",
  fontFamily: "mono",
  fontSize: "11",
  letterSpacing: "widest",
  textTransform: "uppercase",
});

export function SiteFooter() {
  return (
    <footer
      class={css({
        borderColor: "ink",
        borderTopWidth: "1px",
        display: "grid",
        gap: "10",
        gridTemplateColumns: { base: "1fr 1fr", lg: "1.3fr repeat(5,1fr)" },
        mt: "10",
        paddingBottom: "12",
        pt: "10",
      })}
    >
      <div class={css({ gridColumn: { base: "1 / -1", lg: "auto" } })}>
        <Brand />
        <p class={css({ color: "mut", fontSize: "15", maxW: "[28ch]", mt: "3" })}>
          Large file delivery for creative work. Uploads that recover instead of restart.
        </p>
      </div>
      <For each={columns}>
        {(column) => (
          <div>
            <h2 class={label}>{column.title}</h2>
            <ul class={css({ display: "grid", gap: "2", listStyle: "none", mt: "3.5", p: "0" })}>
              <For each={column.links}>
                {(link) => (
                  <li>
                    <a
                      class={css({
                        _hover: { color: "ink", textDecoration: "underline" },
                        color: "[#3a3b40]",
                        fontSize: "15",
                        overflowWrap: "anywhere",
                        textUnderlineOffset: "[3px]",
                      })}
                      href={link.href}
                    >
                      {link.label}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </div>
        )}
      </For>
      <p
        class={css({
          borderColor: "line",
          borderTopWidth: "1px",
          color: "mut",
          display: "flex",
          flexWrap: "wrap",
          fontSize: "13",
          gap: "2",
          gridColumn: "1 / -1",
          justifyContent: "space-between",
          pt: "5",
        })}
      >
        <span>© 2026 Tranzfer</span>
        <span>Payments by Polar, our merchant of record.</span>
      </p>
    </footer>
  );
}

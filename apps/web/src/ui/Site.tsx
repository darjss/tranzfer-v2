import type { ParentProps } from "solid-js";
import { For } from "solid-js";
import { css } from "styled-system/css";
import Brand from "../landing/Brand";
import { button } from "./Button";

// Chrome for the public pages (landing, legal, 404): one top bar, one footer.

export const supportEmail = "support@tranzfer.app";

const shell = css({ marginInline: "auto", maxW: "page", pos: "relative", px: "7" });

export function SiteHeader(props: ParentProps) {
  return (
    <nav
      class={css({
        alignItems: "center",
        borderBottomWidth: "1px",
        borderColor: "ink",
        display: "flex",
        h: "16",
        justifyContent: "space-between",
        pos: "relative",
        zIndex: 5,
      })}
    >
      <Brand />
      {props.children ?? (
        <a class={button({ size: "sm", variant: "outline" })} href="/sign-in">
          Sign in
        </a>
      )}
    </nav>
  );
}

const columns = [
  {
    links: [
      { href: "/#desk", label: "What it survives" },
      { href: "/#how", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/sign-in", label: "Sign in" },
    ],
    title: "Product",
  },
  {
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/acceptable-use", label: "Acceptable use" },
    ],
    title: "Legal",
  },
  {
    links: [
      { href: `mailto:${supportEmail}`, label: supportEmail },
      { href: `mailto:${supportEmail}?subject=Abuse%20report`, label: "Report a link" },
    ],
    title: "Contact",
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
        gridTemplateColumns: { base: "1fr 1fr", md: "1.4fr 1fr 1fr 1.2fr" },
        mt: "10",
        paddingBottom: "12",
        pt: "10",
      })}
    >
      <div class={css({ gridColumn: { base: "1 / -1", md: "auto" } })}>
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

/** Header, a centered column and the footer: the frame every static page shares. */
export function SitePage(props: ParentProps) {
  return (
    <div class={shell}>
      <SiteHeader />
      {props.children}
      <SiteFooter />
    </div>
  );
}

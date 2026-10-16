// The feature pages (features.ts) and use-case pages (audiences.ts) share this
// shape. One entry each feeds the nav menus, the page template and the
// prerender list. Only claim what Tranzfer does today.

/** When these pages last changed, shown on each one. ISO, so <time> can use it. */
export const lastUpdated = "2026-10-09";

export interface Page {
  readonly description: string;
  readonly eyebrow: string;
  readonly image: string;
  readonly lede: string;
  readonly menu: string;
  readonly note: string;
  readonly points: readonly { readonly h: string; readonly p: string }[];
  readonly slug: string;
  readonly title: readonly [string, string];
  /** Use-case pages: how a send goes for this person, start to finish. */
  readonly steps?: readonly { readonly h: string; readonly p: string }[];
  /** File types this person sends, in the words they'd search with. */
  readonly files?: readonly string[];
  /** What Tranzfer replaces for them. */
  readonly instead?: readonly { readonly h: string; readonly p: string }[];
  readonly faq?: readonly { readonly q: string; readonly a: string }[];
  /** Guides listed first under "Read next". */
  readonly guides?: readonly { readonly href: string; readonly label: string }[];
}

export const resources = [
  { href: "/guides", menu: "Guides" },
  { href: "/tools/upload-time-calculator", menu: "Upload time calculator" },
  { href: "/pricing", menu: "Pricing calculator" },
  { href: "/guides#comparisons", menu: "Alternatives and comparisons" },
  { href: "/vs/masv", menu: "Tranzfer vs MASV" },
  { href: "/vs/wetransfer", menu: "Tranzfer vs WeTransfer" },
  { href: "/#faq", menu: "Questions" },
  { href: "/about", menu: "Why we built it" },
  { href: "mailto:support@tranzfer.app", menu: "Help" },
];

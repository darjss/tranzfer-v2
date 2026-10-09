import { css } from "styled-system/css";
import { lastUpdated } from "./content";

// The trail above a marketing page and the date it last changed. The section
// has no index page yet, so it stays plain text and out of the JSON-LD, which
// needs a URL for every step but the last.

const updated = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(
  new Date(lastUpdated),
);

const mono = css({ color: "mut", fontFamily: "mono", fontSize: "13" });

export function Crumbs(props: {
  readonly name: string;
  readonly path: string;
  readonly section: string;
}) {
  return (
    <div
      class={css({
        alignItems: "baseline",
        columnGap: "6",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        pt: { base: "5", lg: "7" },
        rowGap: "1",
      })}
    >
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", item: "https://tranzfer.app/", name: "Home", position: 1 },
            {
              "@type": "ListItem",
              item: `https://tranzfer.app${props.path}`,
              name: props.name,
              position: 2,
            },
          ],
        })}
      </script>
      <nav aria-label="Breadcrumb" class={mono}>
        <ol
          class={css({
            "& li + li::before": { content: "'/'", px: "2" },
            display: "flex",
            flexWrap: "wrap",
            listStyle: "none",
          })}
        >
          <li>
            <a
              class={css({
                _hover: { color: "ink" },
                textDecoration: "underline",
                textDecorationColor: "line",
                textUnderlineOffset: "[3px]",
              })}
              href="/"
            >
              Home
            </a>
          </li>
          <li>{props.section}</li>
          <li aria-current="page" class={css({ color: "ink" })}>
            {props.name}
          </li>
        </ol>
      </nav>
      <p class={mono}>
        Updated <time datetime={lastUpdated}>{updated}</time>
      </p>
    </div>
  );
}

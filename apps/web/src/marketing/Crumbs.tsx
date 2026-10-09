import { Show } from "solid-js";
import { css } from "styled-system/css";
import { lastUpdated } from "./content";

// The trail above a marketing page and the date it last changed. A section
// without an index page stays plain text and out of the JSON-LD, which needs a
// URL for every step but the last.

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

const mono = css({ color: "mut", fontFamily: "mono", fontSize: "13" });

const link = css({
  _hover: { color: "ink" },
  textDecoration: "underline",
  textDecorationColor: "line",
  textUnderlineOffset: "[3px]",
});

export function Crumbs(props: {
  readonly name: string;
  readonly path: string;
  readonly section: string;
  readonly sectionHref?: string;
  /** ISO date; the marketing pages' shared date when unset. */
  readonly updated?: string;
}) {
  const updated = () => props.updated ?? lastUpdated;
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
            { item: "https://tranzfer.app/", name: "Home" },
            ...(props.sectionHref === undefined
              ? []
              : [{ item: `https://tranzfer.app${props.sectionHref}`, name: props.section }]),
            { item: `https://tranzfer.app${props.path}`, name: props.name },
          ].map((step, i) => ({ "@type": "ListItem", ...step, position: i + 1 })),
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
            <a class={link} href="/">
              Home
            </a>
          </li>
          <li>
            <Show when={props.sectionHref} fallback={props.section}>
              {(href) => (
                <a class={link} href={href()}>
                  {props.section}
                </a>
              )}
            </Show>
          </li>
          <li aria-current="page" class={css({ color: "ink" })}>
            {props.name}
          </li>
        </ol>
      </nav>
      <p class={mono}>
        Updated <time datetime={updated()}>{day.format(new Date(updated()))}</time>
      </p>
    </div>
  );
}

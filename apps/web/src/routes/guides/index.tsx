import { Link, Meta, Title } from "@solidjs/meta";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { alternatives, comparisons, guides } from "../../guides/pages";
import { eyebrow, lede, sectionTitle } from "../../landing/styles";
import "../../landing/landing.css";
import Reveal from "../../ui/Reveal";
import { SitePage } from "../../ui/Site";

const site = "https://tranzfer.app";
const description =
  "Plain answers about sending large files: video to an editor, RAW photos to a client, audio sessions to a mixer, failed uploads, upload times, and how the other tools compare.";

const pages = [
  ...guides.map((page) => ({ ...page, href: `/guides/${page.slug}` })),
  ...alternatives.map((page) => ({ ...page, href: `/alternatives/${page.slug}` })),
  ...comparisons.map((page) => ({ ...page, href: `/compare/${page.slug}` })),
];

// The hub's groups, in order. Each Markdown page names its group.
const titles = {
  basics: "Sending",
  comparisons: "Alternatives and comparisons",
  formats: "By file type",
  problems: "When an upload fails",
  sizes: "Sizes and upload times",
} satisfies Record<(typeof pages)[number]["section"], string>;

const tools = [
  {
    href: "/tools/upload-time-calculator",
    summary: "File size and upload speed in, time out. Runs in your browser.",
    title: "Upload time calculator",
  },
  {
    href: "/pricing",
    summary: "What the same month of deliveries costs on Tranzfer, MASV, Smash and Filemail.",
    title: "Price calculator",
  },
];

const sections = [
  ...Object.entries(titles).map(([id, title]) => ({
    id,
    items: pages.filter((page) => page.section === id),
    title,
  })),
  { id: "tools", items: tools, title: "Tools" },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  description,
  mainEntity: {
    "@type": "ItemList",
    itemListElement: sections
      .flatMap((section) => section.items)
      .map((item, i) => ({
        "@type": "ListItem",
        name: item.title,
        position: i + 1,
        url: `${site}${item.href}`,
      })),
  },
  name: "Guides to sending large files",
  url: `${site}/guides`,
};

const card = css({
  _hover: { shadow: "paperLift", translate: "[0 -2px]" },
  bg: "panel",
  borderRadius: "card",
  display: "block",
  h: "full",
  p: "7",
  shadow: "ring",
  transitionDuration: "fast",
  transitionProperty: "[box-shadow,translate]",
});

function Cards(props: {
  readonly items: readonly {
    readonly href: string;
    readonly summary: string;
    readonly title: string;
  }[];
}) {
  return (
    <ul
      class={css({
        display: "grid",
        gap: "4",
        gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" },
        listStyle: "none",
        mt: "6",
        p: "0",
      })}
    >
      <For each={props.items}>
        {(item, i) => (
          <li class="rv" style={`--d:${i() * 60}ms`}>
            <a class={card} href={item.href}>
              <h3 class={css({ fontSize: "[19px]", fontWeight: "semibold", lineHeight: "[1.3]" })}>
                {item.title}
              </h3>
              <p class={css({ color: "mut", fontSize: "15", mt: "2", textWrap: "pretty" })}>
                {item.summary}
              </p>
            </a>
          </li>
        )}
      </For>
    </ul>
  );
}

export default function Guides() {
  return (
    <SitePage>
      <Title>Guides to sending large files · Tranzfer</Title>
      <Meta name="description" content={description} />
      <Meta property="og:title" content="Guides to sending large files · Tranzfer" />
      <Meta property="og:description" content={description} />
      <Meta property="og:url" content={`${site}/guides`} />
      <Link rel="canonical" href={`${site}/guides`} />
      <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      <Reveal>
        <main id="content" class={css({ pb: "10", pt: { base: "12", lg: "20" } })}>
          <p class={cx("rv", eyebrow)}>Guides</p>
          <h1 class={cx("rv", sectionTitle, css({ maxW: "[16ch]" }))}>
            Sending big files, <i>answered.</i>
          </h1>
          <p class={cx("rv", lede)} style="--d:80ms">
            One question per page, answered in the first sentence. Real file sizes, real steps, and
            an honest word on when another tool fits better.
          </p>

          <For each={sections}>
            {(section) => (
              <section class={css({ mt: "14", scrollMarginTop: "[96px]" })} id={section.id}>
                <h2 class={eyebrow}>{section.title}</h2>
                <Cards items={section.items} />
              </section>
            )}
          </For>
        </main>
      </Reveal>
    </SitePage>
  );
}

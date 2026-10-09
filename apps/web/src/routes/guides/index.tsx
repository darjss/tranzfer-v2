import { Link, Meta, Title } from "@solidjs/meta";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { guides } from "../../guides/guides";
import { eyebrow, lede, sectionTitle } from "../../landing/styles";
import "../../landing/landing.css";
import Reveal from "../../ui/Reveal";
import { SitePage } from "../../ui/Site";

const site = "https://tranzfer.app";
const description =
  "Plain answers about sending large files: video to an editor, RAW photos to a client, audio sessions to a mixer, and how long a 100 GB upload takes.";

// The pillar first, then the specific questions.
const list = (
  [
    "how-to-send-large-files",
    "send-large-video-files-to-an-editor",
    "send-raw-photos-to-a-client",
    "send-pro-tools-or-logic-session",
    "how-long-to-upload-100-gb",
  ] as const
).map((slug) => ({ href: `/guides/${slug}`, ...guides[slug] }));

const more = [
  {
    href: "/tools/upload-time-calculator",
    summary: "File size and upload speed in, time out. Runs in your browser.",
    title: "Upload time calculator",
  },
  {
    href: "/alternatives/wetransfer",
    summary: "Six services ranked for big files, with prices, limits and what happens on a drop.",
    title: "WeTransfer alternatives for large files",
  },
  {
    href: "/alternatives/masv",
    summary: "Flat plans against per-GB pricing, and who should stay with MASV.",
    title: "MASV alternatives for large files",
  },
  {
    href: "/pricing",
    summary: "What the same month of deliveries costs on Tranzfer, MASV, Smash and Filemail.",
    title: "Price calculator",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  description,
  mainEntity: {
    "@type": "ItemList",
    itemListElement: [...list, ...more].map((item, i) => ({
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

          <section class={css({ mt: "14" })}>
            <h2 class={eyebrow}>Questions</h2>
            <Cards items={list} />
          </section>

          <section class={css({ mt: "14" })}>
            <h2 class={eyebrow}>Tools and comparisons</h2>
            <Cards items={more} />
          </section>
        </main>
      </Reveal>
    </SitePage>
  );
}

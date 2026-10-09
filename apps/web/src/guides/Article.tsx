import { Link, Meta, Title } from "@solidjs/meta";
import type { JSX } from "@solidjs/web";
import type { ParentProps } from "solid-js";
import { For, Show } from "solid-js";
import { css, cx } from "styled-system/css";
import { ArrowIcon } from "../landing/notebook";
import { eyebrow, sectionTitle } from "../landing/styles";
import "../landing/landing.css";
import { button } from "../ui/Button";
import Reveal from "../ui/Reveal";
import { SitePage } from "../ui/Site";

// One answer page: guides, alternatives and tools. The first paragraph answers
// the question in the title; the rest is prose, a FAQ and the JSON-LD that
// tells search and answer engines the same thing.

const site = "https://tranzfer.app";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

/** Body copy: headings, lists and links inside an article. */
export const prose = css({
  "& :is(p, ul, ol, h2, h3)": { maxW: "[68ch]" },
  "& a": { color: "blue", textDecoration: "underline", textUnderlineOffset: "[3px]" },
  "& h2": {
    color: "ink",
    fontSize: "26",
    fontWeight: "semibold",
    letterSpacing: "tight",
    lineHeight: "[1.2]",
    mt: "14",
    textWrap: "balance",
  },
  "& h3": { color: "ink", fontSize: "[19px]", fontWeight: "semibold", mt: "8" },
  "& li": { mt: "2", pl: "1" },
  "& ol": { listStyleType: "decimal", mt: "4", pl: "6" },
  "& p": { mt: "4" },
  "& strong": { color: "ink", fontWeight: "semibold" },
  "& ul": { listStyleType: "disc", mt: "4", pl: "6" },
  color: "[#3a3b40]",
  fontSize: "17",
  lineHeight: "[1.65]",
  textWrap: "pretty",
});

/** A table that scrolls sideways on a phone instead of squashing. */
export const tableWrap = css({ mt: "6", overflowX: "auto", w: "full" });

export const table = css({
  "& tbody th": { color: "ink", fontWeight: "semibold" },
  "& td, & th": {
    borderColor: "line",
    borderTopWidth: "1px",
    pr: "5",
    py: "3",
    textAlign: "left",
    verticalAlign: "top",
  },
  "& thead th": {
    borderTopWidth: "0",
    color: "mut",
    fontFamily: "mono",
    fontSize: "11",
    fontWeight: "normal",
    letterSpacing: "widest",
    pb: "2",
    textTransform: "uppercase",
  },
  "& tr.us": { bg: "panel" },
  "& tr.us > *": { color: "ink" },
  borderCollapse: "collapse",
  fontSize: "15",
  lineHeight: "[1.5]",
  w: "full",
});

export default function Article(
  props: ParentProps<{
    /** The direct answer, one or two sentences. */
    readonly answer: JSX.Element;
    readonly description: string;
    readonly eyebrow: string;
    readonly faq: readonly { readonly q: string; readonly a: string }[];
    readonly path: string;
    readonly related: readonly { readonly href: string; readonly label: string }[];
    readonly title: string;
    /** An interactive tool shown right under the answer, outside the prose styles. */
    readonly tool?: JSX.Element;
    /** ISO date the facts on the page were last checked. */
    readonly updated: string;
  }>,
) {
  const url = () => `${site}${props.path}`;
  const structuredData = () => ({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        author: { "@type": "Organization", name: "Tranzfer", url: `${site}/` },
        dateModified: props.updated,
        datePublished: props.updated,
        description: props.description,
        headline: props.title,
        mainEntityOfPage: url(),
        publisher: {
          "@type": "Organization",
          logo: `${site}/icon-512.png`,
          name: "Tranzfer",
          url: `${site}/`,
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: props.faq.map((item) => ({
          "@type": "Question",
          acceptedAnswer: { "@type": "Answer", text: item.a },
          name: item.q,
        })),
      },
    ],
  });

  return (
    <SitePage>
      <Title>{`${props.title} · Tranzfer`}</Title>
      <Meta name="description" content={props.description} />
      <Meta property="og:title" content={`${props.title} · Tranzfer`} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:type" content="article" />
      <Meta property="og:url" content={url()} />
      <Meta property="article:modified_time" content={props.updated} />
      <Link rel="canonical" href={url()} />
      <script type="application/ld+json">{JSON.stringify(structuredData())}</script>
      <Reveal>
        <main id="content" class={css({ pb: "10", pt: { base: "12", lg: "20" } })}>
          <article>
            <p class={cx("rv", eyebrow)}>{props.eyebrow}</p>
            <h1
              class={cx(
                "rv",
                sectionTitle,
                css({ fontSize: "[clamp(36px,4.6vw,60px)]", maxW: "[20ch]" }),
              )}
            >
              {props.title}
            </h1>
            <p class={cx("rv", css({ color: "mut", fontSize: "13", mt: "5" }))}>
              Updated <time datetime={props.updated}>{day.format(new Date(props.updated))}</time>
            </p>
            <div
              class={cx(
                "rv",
                css({
                  "& a": { color: "blue", textDecoration: "underline" },
                  borderColor: "blue",
                  borderLeftWidth: "[3px]",
                  color: "ink",
                  fontSize: "[20px]",
                  lineHeight: "[1.55]",
                  maxW: "[62ch]",
                  mt: "6",
                  pl: "5",
                  textWrap: "pretty",
                }),
              )}
              style="--d:80ms"
            >
              {props.answer}
            </div>

            <Show when={props.tool}>
              <div class={cx("rv", css({ mt: "10" }))} style="--d:140ms">
                {props.tool}
              </div>
            </Show>

            <div class={prose}>{props.children}</div>

            <section class={css({ mt: "16" })}>
              <h2 class={css({ fontSize: "26", fontWeight: "semibold", letterSpacing: "tight" })}>
                Questions people ask
              </h2>
              <div class={css({ maxW: "[760px]", mt: "4" })}>
                <For each={props.faq}>
                  {(item) => (
                    <details class={css({ borderColor: "line", borderTopWidth: "1px", py: "5" })}>
                      <summary
                        class={css({
                          cursor: "pointer",
                          fontSize: "[18px]",
                          fontWeight: "semibold",
                        })}
                      >
                        {item.q}
                      </summary>
                      <p class={css({ color: "mut", fontSize: "17", mt: "3", textWrap: "pretty" })}>
                        {item.a}
                      </p>
                    </details>
                  )}
                </For>
              </div>
            </section>
          </article>

          <section
            class={css({
              bg: "panel",
              borderRadius: "card",
              mt: "16",
              p: { base: "6", md: "10" },
              shadow: "paper",
            })}
          >
            <h2 class={css({ fontSize: "26", fontWeight: "semibold", letterSpacing: "tight" })}>
              Got a big one to send?
            </h2>
            <p class={css({ color: "mut", fontSize: "17", maxW: "[54ch]", mt: "2" })}>
              Tranzfer sends hundreds of gigabytes from the browser and picks up where it left off
              when the connection drops. Free holds 20 GB at once, no card.
            </p>
            <div
              class={css({
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: "4",
                mt: "6",
              })}
            >
              <a class={button()} href="/sign-in">
                Start free <ArrowIcon />
              </a>
              <a
                class={css({ _hover: { color: "ink" }, color: "mut", fontWeight: "semibold" })}
                href="/pricing"
              >
                See pricing
              </a>
            </div>
          </section>

          <nav
            aria-label="Related pages"
            class={css({ display: "flex", flexWrap: "wrap", gap: "3", pt: "10" })}
          >
            <span class={cx(eyebrow, css({ alignSelf: "center", mr: "2" }))}>Read next</span>
            <For each={props.related}>
              {(link) => (
                <a
                  class={css({
                    _hover: { bg: "white", color: "ink" },
                    bg: "panel",
                    borderRadius: "full",
                    color: "[#3a3b40]",
                    fontSize: "15",
                    px: "4",
                    py: "2",
                    shadow: "ring",
                    transitionDuration: "fast",
                    transitionProperty: "[background-color,color]",
                  })}
                  href={link.href}
                >
                  {link.label}
                </a>
              )}
            </For>
          </nav>
        </main>
      </Reveal>
    </SitePage>
  );
}

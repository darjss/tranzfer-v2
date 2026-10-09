import { Link, Meta, Title } from "@solidjs/meta";
import { PlanId, plans } from "@tranzfer/contracts";
import { For, Show } from "solid-js";
import { css, cx } from "styled-system/css";
import type { Page } from "./content";
import { Crumbs } from "./Crumbs";
import { bytes } from "../dashboard/format";
import { ArrowIcon, Hand } from "../landing/notebook";
import { eyebrow, sectionTitle } from "../landing/styles";
import "../landing/landing.css";
import { button } from "../ui/Button";
import Reveal from "../ui/Reveal";
import { SitePage } from "../ui/Site";

// One feature or use-case page: a claim, a photo, three plain points, a FAQ,
// the plans and links onward. Use-case pages add how a send goes, file types
// and what it replaces. Below the hero each section is a notebook row: a
// handwritten label in the margin, the content beside it.

export const noteRow = css({
  borderColor: "line",
  borderTopWidth: "1px",
  columnGap: "10",
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "[180px minmax(0,1fr)]" },
  py: { base: "7", lg: "9" },
  rowGap: "4",
});

export const noteLabel = css({
  color: "blue",
  fontFamily: "hand",
  fontSize: "26",
  fontWeight: "semibold",
  lineHeight: "compact",
  rotate: "[-2deg]",
  transformOrigin: "left",
});

const body = css({ color: "mut", fontSize: "15", mt: "1", textWrap: "pretty" });

export default function MarketingPage(props: {
  readonly page: Page;
  readonly path: string;
  readonly related: readonly { readonly href: string; readonly label: string }[];
}) {
  const url = () => `https://tranzfer.app${props.path}`;
  const title = () => `${props.page.title[0]} ${props.page.title[1]}`;
  const useCase = () => props.path.startsWith("/for/");
  // "For videographers" in the menu reads as "Videographers" in the trail.
  const crumb = () => {
    const name = props.page.menu.replace(/^For /u, "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <SitePage>
      <Title>{`${props.page.eyebrow} · Tranzfer`}</Title>
      <Meta name="description" content={props.page.description} />
      <Meta property="og:title" content={`${title()} · Tranzfer`} />
      <Meta property="og:description" content={props.page.description} />
      <Meta property="og:url" content={url()} />
      <Link rel="canonical" href={url()} />
      <Reveal>
        <main id="content">
          <Crumbs name={crumb()} path={props.path} section={useCase() ? "Use cases" : "Features"} />
          <section
            class={css({
              alignItems: "center",
              display: "grid",
              gap: { base: "10", lg: "14" },
              gridTemplateColumns: { base: "1fr", lg: "minmax(0,1.15fr) minmax(0,.85fr)" },
              pb: { base: "10", lg: "14" },
              pt: { base: "8", lg: "10" },
            })}
          >
            <div>
              <p class={cx("rv", eyebrow)}>{props.page.eyebrow}</p>
              <h1
                class={cx(
                  "rv",
                  sectionTitle,
                  css({ fontSize: "[clamp(38px,4.6vw,62px)]", lineHeight: "[1]" }),
                )}
              >
                {props.page.title[0]}
                <br />
                <i>{props.page.title[1]}</i>
              </h1>
              <p
                class={cx(
                  "rv",
                  css({
                    color: "[#3a3b40]",
                    fontSize: "17",
                    lineHeight: "[1.6]",
                    maxW: "[52ch]",
                    mt: "5",
                    textWrap: "pretty",
                  }),
                )}
                style="--d:80ms"
              >
                {props.page.lede}
              </p>
              <div
                class={cx(
                  "rv",
                  css({
                    alignItems: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "5",
                    mt: "7",
                  }),
                )}
                style="--d:140ms"
              >
                <a class={button()} href="/sign-in">
                  Start free <ArrowIcon />
                </a>
                <span class={css({ color: "mut", fontSize: "15" })}>20 GB free, no card.</span>
              </div>
            </div>
            <div class={css({ pos: "relative", px: { base: "2", lg: "0" } })}>
              <Hand tone="red" style="left:-4%;bottom:-9%;--r:-4deg;--d:.8s">
                {props.page.note}
              </Hand>
              <div
                class={cx(
                  "note",
                  "rv",
                  css({
                    bg: "white",
                    borderRadius: "md",
                    pb: "8",
                    pt: "2.5",
                    px: "2.5",
                    rotate: "var(--r)",
                    shadow: "[0 40px 70px -40px rgba(23,24,28,.55),0 0 0 1px rgba(0,0,0,.06)]",
                  }),
                )}
                style="--r:2deg;--d:120ms"
              >
                <span class="tape" />
                <img
                  alt=""
                  class={css({
                    aspectRatio: "landscape",
                    borderRadius: "photo",
                    objectFit: "cover",
                    w: "full",
                  })}
                  src={props.page.image}
                />
              </div>
            </div>
          </section>

          <ul
            class={css({
              borderColor: "line",
              borderTopWidth: "1px",
              display: "grid",
              gap: { base: "5", md: "8" },
              gridTemplateColumns: { base: "1fr", md: "repeat(3,minmax(0,1fr))" },
              listStyle: "none",
              py: { base: "7", lg: "9" },
            })}
          >
            <For each={props.page.points}>
              {(point, i) => (
                <li class={css({ display: "grid", gap: "3", gridTemplateColumns: "[auto 1fr]" })}>
                  <span
                    aria-hidden="true"
                    class={css({ color: "blue", fontFamily: "mono", fontSize: "13", pt: "0.5" })}
                  >
                    0{i() + 1}
                  </span>
                  <div>
                    <h2
                      class={css({ fontSize: "17", fontWeight: "semibold", letterSpacing: "snug" })}
                    >
                      {point.h}
                    </h2>
                    <p class={body}>{point.p}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>

          <Show when={props.page.steps}>
            {(steps) => (
              <section class={noteRow}>
                <h2 class={noteLabel}>How a send goes</h2>
                <div
                  class={css({
                    alignItems: "start",
                    display: "grid",
                    gap: { base: "8", lg: "12" },
                    gridTemplateColumns: { base: "1fr", md: "minmax(0,1.2fr) minmax(0,1fr)" },
                  })}
                >
                  <ol class={css({ listStyle: "none" })}>
                    <For each={steps()}>
                      {(step, i) => (
                        <li
                          class={css({
                            "& + &": {
                              borderColor: "line",
                              borderTopStyle: "dashed",
                              borderTopWidth: "1px",
                            },
                            display: "grid",
                            gap: "4",
                            gridTemplateColumns: "[32px 1fr]",
                            py: "4",
                          })}
                        >
                          <span
                            aria-hidden="true"
                            class={css({
                              color: "blue",
                              fontFamily: "hand",
                              fontSize: "40",
                              fontWeight: "semibold",
                              lineHeight: "[.8]",
                            })}
                          >
                            {i() + 1}
                          </span>
                          <div>
                            <h3
                              class={css({
                                fontSize: "17",
                                fontWeight: "semibold",
                                letterSpacing: "snug",
                              })}
                            >
                              {step.h}
                            </h3>
                            <p class={body}>{step.p}</p>
                          </div>
                        </li>
                      )}
                    </For>
                  </ol>
                  <Show when={props.page.files}>
                    {(files) => (
                      <div
                        class={cx(
                          "note",
                          "rv",
                          css({
                            bg: "white",
                            borderRadius: "md",
                            mt: { base: "0", md: "3" },
                            pos: "relative",
                            px: "6",
                            py: "5",
                            rotate: "var(--r)",
                            shadow:
                              "[0 30px 60px -36px rgba(23,24,28,.5),0 0 0 1px rgba(0,0,0,.06)]",
                          }),
                        )}
                        style="--r:-1.5deg"
                      >
                        <span class="tape" />
                        <h3 class={eyebrow}>Any file type, including</h3>
                        <ul
                          class={css({
                            columnGap: "6",
                            columns: "2",
                            fontSize: "15",
                            listStyle: "none",
                            mt: "3",
                          })}
                        >
                          <For each={files()}>
                            {(file) => (
                              <li
                                class={css({
                                  breakInside: "avoid",
                                  display: "flex",
                                  gap: "2",
                                  lineHeight: "snug",
                                  py: "1",
                                })}
                              >
                                <span aria-hidden="true" class={css({ color: "blue" })}>
                                  ✓
                                </span>
                                {file}
                              </li>
                            )}
                          </For>
                        </ul>
                      </div>
                    )}
                  </Show>
                </div>
              </section>
            )}
          </Show>

          <Show when={props.page.instead}>
            {(instead) => (
              <section class={noteRow}>
                <h2 class={noteLabel}>What it replaces</h2>
                <ul class={css({ listStyle: "none" })}>
                  <For each={instead()}>
                    {(item) => (
                      <li
                        class={css({
                          alignItems: "baseline",
                          columnGap: "8",
                          display: "grid",
                          gridTemplateColumns: { base: "1fr", md: "minmax(0,1fr) minmax(0,1fr)" },
                          py: "2",
                          rowGap: "1",
                        })}
                      >
                        <s
                          class={css({
                            fontFamily: "hand",
                            fontSize: "26",
                            fontWeight: "semibold",
                            lineHeight: "compact",
                            textDecorationColor: "rust",
                            textDecorationThickness: "[2px]",
                          })}
                        >
                          {item.h}
                        </s>
                        <p class={css({ color: "[#3a3b40]", fontSize: "15", textWrap: "pretty" })}>
                          {item.p}
                        </p>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </Show>

          <Show when={props.page.faq}>
            {(faq) => (
              <section class={noteRow}>
                <script type="application/ld+json">
                  {JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    mainEntity: faq().map((item) => ({
                      "@type": "Question",
                      acceptedAnswer: { "@type": "Answer", text: item.a },
                      name: item.q,
                    })),
                  })}
                </script>
                <h2 class={noteLabel}>Questions</h2>
                <div
                  class={css({ borderBottomWidth: "1px", borderColor: "line", maxW: "[720px]" })}
                >
                  <For each={faq()}>
                    {(item) => (
                      <details
                        class={css({
                          "&:first-child": { borderTopWidth: "0" },
                          "&[open] summary span": { rotate: "[45deg]" },
                          borderColor: "line",
                          borderTopWidth: "1px",
                        })}
                      >
                        <summary
                          class={css({
                            "&::-webkit-details-marker": { display: "none" },
                            alignItems: "center",
                            cursor: "pointer",
                            display: "flex",
                            fontSize: "17",
                            fontWeight: "semibold",
                            gap: "4",
                            justifyContent: "space-between",
                            letterSpacing: "snug",
                            listStyle: "none",
                            py: "3",
                          })}
                        >
                          {item.q}
                          <span
                            aria-hidden="true"
                            class={css({
                              color: "blue",
                              flexShrink: 0,
                              fontSize: "22",
                              fontWeight: "normal",
                              lineHeight: "none",
                              transitionDuration: "normal",
                              transitionProperty: "[rotate]",
                            })}
                          >
                            +
                          </span>
                        </summary>
                        <p class={cx(body, css({ maxW: "[62ch]", mt: "0", pb: "4" }))}>{item.a}</p>
                      </details>
                    )}
                  </For>
                </div>
              </section>
            )}
          </Show>

          <section class={noteRow}>
            <h2 class={noteLabel}>What it costs</h2>
            <div>
              <dl
                class={css({
                  display: "grid",
                  gap: "4",
                  gridTemplateColumns: {
                    base: "repeat(2,minmax(0,1fr))",
                    md: "repeat(4,minmax(0,1fr))",
                  },
                })}
              >
                <For each={PlanId.literals}>
                  {(id) => (
                    <div
                      class={css({ borderColor: "line", borderLeftWidth: "2px", pl: "4", py: "1" })}
                    >
                      <dt class={css({ fontSize: "15", fontWeight: "semibold" })}>
                        {plans[id].name}{" "}
                        <span class={css({ color: "mut", fontWeight: "normal" })}>
                          {plans[id].monthlyUsd === 0 ? "$0" : `$${plans[id].monthlyUsd}/mo`}
                        </span>
                      </dt>
                      <dd class={css({ color: "mut", fontSize: "13", mt: "0.5" })}>
                        {bytes(plans[id].activeBytes)} at once, links up to{" "}
                        {plans[id].maxRetentionDays} days
                      </dd>
                    </div>
                  )}
                </For>
              </dl>
              <p class={css({ color: "mut", fontSize: "15", maxW: "[62ch]", mt: "4" })}>
                You pay for what's live at once, not for every gigabyte you send. When a link ends,
                its space comes back.{" "}
                <a
                  class={css({ _hover: { color: "ink" }, color: "blue", fontWeight: "semibold" })}
                  href="/pricing"
                >
                  Compare prices
                </a>
              </p>
            </div>
          </section>

          <nav aria-label="Related pages" class={noteRow}>
            <h2 class={noteLabel}>{useCase() ? "More use cases" : "More features"}</h2>
            <ul
              class={css({
                columnGap: "6",
                display: "flex",
                flexWrap: "wrap",
                fontSize: "15",
                listStyle: "none",
                rowGap: "2",
              })}
            >
              {/* The route builds fresh link objects on every visit; key by href so
                  moving between pages keeps the rows that stay. */}
              <For each={props.related} keyed={(link) => link.href}>
                {(link) => (
                  <li>
                    <a
                      class={css({
                        _hover: { color: "blue", textDecorationColor: "blue" },
                        textDecoration: "underline",
                        textDecorationColor: "line",
                        textUnderlineOffset: "[4px]",
                      })}
                      href={link().href}
                    >
                      {link().label}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </nav>
        </main>
      </Reveal>
    </SitePage>
  );
}

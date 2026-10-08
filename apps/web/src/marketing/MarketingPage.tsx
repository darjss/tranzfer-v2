import { Link, Meta, Title } from "@solidjs/meta";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import type { Page } from "./content";
import { ArrowIcon, Hand } from "../landing/notebook";
import { eyebrow, lede, sectionTitle } from "../landing/styles";
import "../landing/landing.css";
import { button } from "../ui/Button";
import Reveal from "../ui/Reveal";
import { SitePage } from "../ui/Site";

// One feature or use-case page: a claim, a photo, three plain points and a
// way in. `related` links to the neighbours in the same menu.

export default function MarketingPage(props: {
  readonly page: Page;
  readonly path: string;
  readonly related: readonly { readonly href: string; readonly label: string }[];
}) {
  const url = () => `https://tranzfer.app${props.path}`;
  const title = () => `${props.page.title[0]} ${props.page.title[1]}`;

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
          <section
            class={css({
              alignItems: "center",
              display: "grid",
              gap: { base: "10", lg: "16" },
              gridTemplateColumns: { base: "1fr", lg: "minmax(0,1.1fr) minmax(0,.9fr)" },
              pos: "relative",
              py: { base: "14", lg: "24" },
            })}
          >
            <div>
              <p class={cx("rv", eyebrow)}>{props.page.eyebrow}</p>
              <h1
                class={cx(
                  "rv",
                  sectionTitle,
                  css({ fontSize: "[clamp(42px,5vw,72px)]", lineHeight: "[.98]" }),
                )}
              >
                {props.page.title[0]}
                <br />
                <i>{props.page.title[1]}</i>
              </h1>
              <p
                class={cx("rv", lede, css({ color: "[#3a3b40]", fontSize: "[19px]" }))}
                style="--d:80ms"
              >
                {props.page.lede}
              </p>
              <div
                class={cx("rv", css({ alignItems: "center", display: "flex", gap: "4", mt: "9" }))}
                style="--d:140ms"
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
            </div>
            <div class={css({ pos: "relative" })}>
              <Hand tone="red" style="right:2%;top:-12%;--r:-5deg;--d:.8s">
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

          <section
            class={css({
              borderColor: "line",
              borderTopWidth: "1px",
              display: "grid",
              gap: "10",
              gridTemplateColumns: { base: "1fr", md: "repeat(3,minmax(0,1fr))" },
              py: { base: "14", lg: "20" },
            })}
          >
            <For each={props.page.points}>
              {(point, i) => (
                <div class="rv" style={`--d:${i() * 80}ms`}>
                  <span class={css({ color: "blue", fontFamily: "mono", textStyle: "xs" })}>
                    0{i() + 1}
                  </span>
                  <h2
                    class={css({
                      fontSize: "22",
                      fontWeight: "semibold",
                      letterSpacing: "tight",
                      mt: "2",
                    })}
                  >
                    {point.h}
                  </h2>
                  <p class={css({ color: "mut", fontSize: "17", mt: "2", textWrap: "pretty" })}>
                    {point.p}
                  </p>
                </div>
              )}
            </For>
          </section>

          <section
            class={css({
              borderColor: "line",
              borderTopWidth: "1px",
              display: "flex",
              flexWrap: "wrap",
              gap: "3",
              py: "10",
            })}
          >
            <span class={cx(eyebrow, css({ alignSelf: "center", mr: "2" }))}>Also</span>
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
          </section>
        </main>
      </Reveal>
    </SitePage>
  );
}

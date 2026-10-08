import { Meta, Title } from "@solidjs/meta";
import type { ParentProps } from "solid-js";
import { css } from "styled-system/css";
import { SitePage } from "../ui/Site";

const prose = css({
  "& a": { textDecoration: "underline", textUnderlineOffset: "[3px]" },
  "& h2": {
    color: "ink",
    fontSize: "22",
    fontWeight: "semibold",
    letterSpacing: "tight",
    lineHeight: "tight",
    mb: "3",
    mt: "12",
    textWrap: "balance",
  },
  "& li": { pl: "1" },
  "& li + li": { mt: "1.5" },
  "& p + p, & p + ul, & ul + p": { mt: "4" },
  "& strong": { color: "ink", fontWeight: "semibold" },
  "& ul": { listStyleType: "disc", pl: "5" },
  color: "[#3a3b40]",
  fontSize: "17",
  lineHeight: "[1.65]",
  maxW: "[68ch]",
  textWrap: "pretty",
});

export default function LegalArticle(
  props: ParentProps<{ description: string; title: string; updated: string }>,
) {
  return (
    <SitePage>
      <Title>{props.title} · Tranzfer</Title>
      <Meta name="description" content={props.description} />
      <main class={css({ py: { base: "14", lg: "20" } })}>
        <p
          class={css({
            color: "mut",
            fontFamily: "mono",
            fontSize: "11",
            letterSpacing: "widest",
            textTransform: "uppercase",
          })}
        >
          Updated {props.updated}
        </p>
        <h1
          class={css({
            fontSize: "[clamp(36px,4.6vw,56px)]",
            fontWeight: "semibold",
            letterSpacing: "[-0.04em]",
            lineHeight: "none",
            mb: "10",
            mt: "3.5",
          })}
        >
          {props.title}
        </h1>
        <article class={prose}>{props.children}</article>
      </main>
    </SitePage>
  );
}

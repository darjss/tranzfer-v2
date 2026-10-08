import { css } from "styled-system/css";

// Type and spacing every landing section shares.

/** The small uppercase label above a section heading. */
export const eyebrow = css({
  color: "mut",
  fontFamily: "mono",
  fontSize: "11",
  letterSpacing: "widest",
  textTransform: "uppercase",
});

export const sectionHead = css({ maxW: "[62ch]", mb: "16" });

/** A section heading; an `<i>` inside it turns blue. */
export const sectionTitle = css({
  "& i": { color: "blue", fontStyle: "italic" },
  fontSize: "[clamp(34px,4.6vw,60px)]",
  fontWeight: "semibold",
  letterSpacing: "[-0.04em]",
  lineHeight: "none",
  mt: "3.5",
  textWrap: "balance",
});

export const lede = css({
  color: "mut",
  maxW: "[54ch]",
  mt: "4.5",
  textStyle: "lg",
  textWrap: "pretty",
});

export const section = css({ pos: "relative", py: { base: "20", lg: "30" } });

/** The centered column the landing's sections sit in. */
export const page = css({ marginInline: "auto", maxW: "page", pos: "relative", px: "7" });

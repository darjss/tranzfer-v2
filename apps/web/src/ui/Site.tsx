import type { ParentProps } from "solid-js";
import { css } from "styled-system/css";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Header, a centered column and the footer: the frame every static page shares. */
export function SitePage(props: ParentProps) {
  return (
    <div class={css({ marginInline: "auto", maxW: "page", pos: "relative", px: "7" })}>
      <SiteHeader />
      {props.children}
      <SiteFooter />
    </div>
  );
}

import { Meta, Title } from "@solidjs/meta";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";
import { css, cx } from "styled-system/css";
import { ArrowIcon } from "../landing/notebook";
import { button } from "../ui/Button";
import { SitePage } from "../ui/Site";

// The catch-all route. httpStatus() sets the response status during SSR
// (a no-op in the browser); it runs in preload so the status code is set
// before the response head flushes.
export const route = {
  preload: () => {
    httpStatus(404);
  },
} satisfies RouteDefinition;

const ghost = css({
  bg: "panel",
  borderRadius: "card",
  inset: "0",
  pos: "absolute",
  shadow: "paperGhost",
});

export default function NotFound() {
  return (
    <SitePage>
      <Title>Not found · Tranzfer</Title>
      <Meta name="robots" content="noindex" />
      <main
        class={css({
          display: "grid",
          minH: "[min(70vh,640px)]",
          placeItems: "center",
          pos: "relative",
          py: "20",
        })}
      >
        <div class={css({ maxW: "[560px]", pos: "relative", w: "full" })}>
          <span
            aria-hidden="true"
            class={css({
              color: "rust",
              display: { base: "none", sm: "block" },
              fontFamily: "hand",
              fontSize: "[24px]",
              fontWeight: "semibold",
              opacity: 0.6,
              pos: "absolute",
              right: "[-2%]",
              rotate: "[6deg]",
              top: "[-58px]",
            })}
          >
            404. it happens.
          </span>
          <div class={cx(ghost, css({ transform: "[rotate(-3deg) translate(-12px,12px)]" }))} />
          <div class={cx(ghost, css({ transform: "[rotate(2.5deg) translate(12px,8px)]" }))} />
          <div
            class={css({
              bg: "panel",
              borderRadius: "card",
              p: { base: "6", sm: "10" },
              pos: "relative",
              rotate: { base: "[0deg]", sm: "[-0.8deg]" },
              shadow: "paper",
            })}
          >
            <p
              class={css({
                color: "mut",
                fontFamily: "mono",
                fontSize: "11",
                letterSpacing: "widest",
                textTransform: "uppercase",
              })}
            >
              Page not found
            </p>
            <h1
              class={css({
                fontSize: { base: "26", sm: "40" },
                fontWeight: "semibold",
                letterSpacing: "title",
                lineHeight: "compact",
                mt: "3",
                textWrap: "balance",
              })}
            >
              Nothing here. <i class={css({ color: "blue" })}>Your files are fine.</i>
            </h1>
            <p class={css({ color: "mut", mt: "3", textWrap: "pretty" })}>
              This address doesn't match a page. If someone sent you a download link, check that it
              came through whole, or ask them for a fresh one.
            </p>
            <div class={css({ display: "flex", flexWrap: "wrap", gap: "3", mt: "7" })}>
              <a class={button({ size: "sm" })} href="/">
                Go to Tranzfer <ArrowIcon />
              </a>
              <a class={button({ size: "sm", variant: "outline" })} href="/deliveries">
                Your deliveries
              </a>
            </div>
          </div>
        </div>
      </main>
    </SitePage>
  );
}

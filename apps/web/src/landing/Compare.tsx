import { plans } from "@tranzfer/contracts";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { ArrowIcon } from "./notebook";
import { eyebrow } from "./styles";
import { bytes } from "../dashboard/format";

// Sits under the plans on the home page. Each line says what's on the other
// side of the link; the numbers match the comparison pages.
const links = [
  {
    h: "Pricing calculator",
    href: "/pricing",
    p: "What would you pay elsewhere? Set your delivery size and how many you send a month, and see the bill next to MASV, Smash and Filemail.",
  },
  {
    h: "Tranzfer vs MASV",
    href: "/vs/masv",
    p: "MASV charges per gigabyte, and closing their browser tab mid-upload means starting over. Here it's a flat plan, and the upload resumes.",
  },
  {
    h: "Tranzfer vs WeTransfer",
    href: "/vs/wetransfer",
    p: `Their free plan is 10 transfers or 3 GB per 30 days. Ours holds ${bytes(plans.free.activeBytes)} live at once, as many sends as you like.`,
  },
];

export default function Compare() {
  return (
    <section
      aria-labelledby="compare"
      class={css({
        borderColor: "ink",
        borderTopWidth: "1px",
        display: "grid",
        gap: { base: "6", lg: "10" },
        gridTemplateColumns: { base: "1fr", lg: "minmax(0,.8fr) repeat(3,minmax(0,1fr))" },
        pb: { base: "4", lg: "6" },
        pt: "8",
      })}
    >
      <div>
        <p class={eyebrow}>Shopping around</p>
        <h2
          id="compare"
          class={css({
            color: "rust",
            fontFamily: "hand",
            fontSize: "[28px]",
            fontWeight: "semibold",
            lineHeight: "compact",
            mt: "2",
            rotate: "[-2deg]",
          })}
        >
          fair. here's the honest side-by-side.
        </h2>
      </div>
      <For each={links}>
        {(link, i) => (
          <a
            href={link.href}
            class={cx(
              "rv",
              "group",
              css({ display: "flex", flexDir: "column", gap: "2", pos: "relative" }),
            )}
            style={`--d:${i() * 70}ms`}
          >
            <span
              class={css({
                color: "ink",
                fontSize: "17",
                fontWeight: "semibold",
                letterSpacing: "snug",
              })}
            >
              <span
                class={css({
                  _groupHover: { textDecorationColor: "ink" },
                  textDecorationColor: "ink/20",
                  textDecorationLine: "underline",
                  textDecorationThickness: "1px",
                  textUnderlineOffset: "[4px]",
                  transitionDuration: "normal",
                  transitionProperty: "[text-decoration-color]",
                })}
              >
                {link.h}
              </span>
              <span
                class={css({
                  "& svg": { boxSize: "4" },
                  _groupHover: { translate: "[3px 0]" },
                  color: "blue",
                  display: "inline-block",
                  ml: "2",
                  transitionDuration: "nudge",
                  transitionProperty: "[translate]",
                  transitionTimingFunction: "smooth",
                  verticalAlign: "[-2px]",
                })}
              >
                <ArrowIcon />
              </span>
            </span>
            <span class={css({ color: "mut", fontSize: "15", textWrap: "pretty" })}>{link.p}</span>
          </a>
        )}
      </For>
    </section>
  );
}

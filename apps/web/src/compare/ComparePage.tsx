import { Link, Meta, Title } from "@solidjs/meta";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import { ArrowIcon } from "../landing/notebook";
import { button } from "../ui/Button";
import { SitePage } from "../ui/Site";

// A side-by-side page against one competitor. Their column only states what
// their own pages say, each row linked to the page it came from.

export interface Row {
  readonly source: string;
  readonly theirs: string;
  readonly topic: string;
  readonly ours: string;
}

const label = css({
  color: "mut",
  fontFamily: "mono",
  fontSize: "11",
  letterSpacing: "widest",
  textTransform: "uppercase",
});

// A table from md up; below that each row stacks, and every value gets its
// column's name from data-label.
const cell = css({
  _before: {
    color: "mut",
    content: "attr(data-label)",
    display: { base: "block", md: "none" },
    fontFamily: "mono",
    fontSize: "11",
    letterSpacing: "widest",
    mb: "1",
    textTransform: "uppercase",
  },
  borderColor: "line",
  borderTopWidth: { base: "0", md: "1px" },
  display: { base: "block", md: "table-cell" },
  pr: { base: "0", md: "6" },
  py: { base: "2", md: "4" },
  textAlign: "left",
  verticalAlign: "top",
});

export default function ComparePage(props: {
  readonly checked: string;
  readonly description: string;
  readonly intro: JSX.Element;
  readonly path: string;
  readonly rows: readonly Row[];
  readonly them: string;
  readonly theyFit: readonly string[];
  readonly title: string;
}) {
  const url = () => `https://tranzfer.app${props.path}`;
  return (
    <SitePage>
      <Title>{props.title} · Tranzfer</Title>
      <Meta name="description" content={props.description} />
      <Meta property="og:title" content={`${props.title} · Tranzfer`} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:url" content={url()} />
      <Link rel="canonical" href={url()} />
      <main class={css({ py: { base: "14", lg: "20" } })}>
        <p class={label}>Tranzfer vs {props.them}</p>
        <h1
          class={css({
            fontSize: "[clamp(36px,4.6vw,56px)]",
            fontWeight: "semibold",
            letterSpacing: "[-0.04em]",
            lineHeight: "none",
            maxW: "[18ch]",
            mt: "3.5",
            textWrap: "balance",
          })}
        >
          {props.title}
        </h1>
        <div
          class={css({
            color: "[#3a3b40]",
            fontSize: "[19px]",
            lineHeight: "[1.6]",
            maxW: "[62ch]",
            mt: "6",
            textWrap: "pretty",
          })}
        >
          {props.intro}
        </div>

        <div class={css({ mt: "12" })}>
          <table
            class={css({
              borderCollapse: "collapse",
              display: { base: "block", md: "table" },
              w: "full",
            })}
          >
            <thead class={css({ display: { base: "none", md: "table-header-group" } })}>
              <tr>
                <th class={css({ pb: "3", w: "[22%]" })} />
                <th class={css({ pb: "3", pr: "6", textAlign: "left", w: "[39%]" })}>
                  <span class={label}>Tranzfer</span>
                </th>
                <th class={css({ pb: "3", textAlign: "left", w: "[39%]" })}>
                  <span class={label}>{props.them}</span>
                </th>
              </tr>
            </thead>
            <tbody class={css({ display: { base: "block", md: "table-row-group" } })}>
              <For each={props.rows}>
                {(row) => (
                  <tr
                    class={css({
                      borderColor: "line",
                      borderTopWidth: { base: "1px", md: "0" },
                      display: { base: "block", md: "table-row" },
                      py: { base: "3", md: "0" },
                    })}
                  >
                    <th class={cx(cell, css({ fontWeight: "semibold" }))} scope="row">
                      {row.topic}
                    </th>
                    <td class={cell} data-label="Tranzfer">
                      {row.ours}
                    </td>
                    <td class={cx(cell, css({ color: "[#3a3b40]" }))} data-label={props.them}>
                      {row.theirs}{" "}
                      <a
                        class={css({ color: "mut", textDecoration: "underline", textStyle: "sm" })}
                        href={row.source}
                        rel="nofollow noopener"
                        target="_blank"
                      >
                        source
                      </a>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p class={css({ color: "mut", mt: "4", textStyle: "sm" })}>
          {props.them} facts come from {props.them}'s own pages, checked {props.checked}. Plans
          change; follow the links for the current version.
        </p>

        <h2
          class={css({
            fontSize: "22",
            fontWeight: "semibold",
            letterSpacing: "tight",
            mt: "14",
          })}
        >
          When {props.them} is the better pick
        </h2>
        <ul
          class={css({
            color: "[#3a3b40]",
            fontSize: "17",
            listStyleType: "disc",
            maxW: "[62ch]",
            mt: "3",
            pl: "5",
          })}
        >
          <For each={props.theyFit}>{(reason) => <li class={css({ mt: "1.5" })}>{reason}</li>}</For>
        </ul>

        <div class={css({ alignItems: "center", display: "flex", gap: "4", mt: "14" })}>
          <a class={button()} href="/sign-in">
            Start free <ArrowIcon />
          </a>
          <span class={css({ color: "mut", textStyle: "sm" })}>20 GB free, no card.</span>
        </div>
      </main>
    </SitePage>
  );
}

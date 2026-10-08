import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import PhCaretDownBold from "~icons/ph/caret-down-bold";
import PhListBold from "~icons/ph/list-bold";
import PhXBold from "~icons/ph/x-bold";
import Brand from "../landing/Brand";
import { audiences, features, resources } from "../marketing/content";
import { button } from "./Button";

// The public pages' top bar. Every menu is a native popover: the browser
// handles click to toggle, Escape, outside clicks, focus return and the
// expanded state. Desktop panels sit under their button by anchor position.

const groups = [
  {
    id: "features",
    items: features.map((f) => ({ href: `/features/${f.slug}`, label: f.menu })),
    label: "Features",
  },
  {
    id: "use-cases",
    items: audiences.map((a) => ({ href: `/for/${a.slug}`, label: a.menu })),
    label: "Use cases",
  },
  {
    id: "resources",
    items: resources.map((r) => ({ href: r.href, label: r.menu })),
    label: "Resources",
  },
];

const trigger = css({
  _hover: { color: "ink" },
  alignItems: "center",
  color: "mut",
  cursor: "pointer",
  display: "flex",
  fontWeight: "medium",
  gap: "1.5",
  minH: "11",
  textStyle: "sm",
  transitionDuration: "fast",
  transitionProperty: "[color]",
});

const panel = css({
  "&:popover-open": { animation: "[menu-in 160ms var(--easings-smooth)]" },
  bg: "panel",
  border: "none",
  borderRadius: "2xl",
  color: "ink",
  inset: "[auto]",
  m: "0",
  minW: "[240px]",
  mt: "1",
  p: "2",
  shadow: "paper",
});

const item = css({
  _hover: { bg: "ink/5", color: "ink" },
  alignItems: "center",
  borderRadius: "lg",
  color: "[#3a3b40]",
  display: "flex",
  fontSize: "15",
  minH: "11",
  px: "3.5",
  transitionDuration: "fast",
  transitionProperty: "[background-color,color]",
  whiteSpace: "nowrap",
});

const caret = css({
  "[aria-expanded=true] > &": { rotate: "[180deg]" },
  boxSize: "3",
  transitionDuration: "fast",
  transitionProperty: "[rotate]",
});

const groupLabel = css({
  "&::-webkit-details-marker": { display: "none" },
  "[open] > &": { "& svg": { rotate: "[180deg]" } },
  alignItems: "center",
  color: "ink",
  cursor: "pointer",
  display: "flex",
  fontWeight: "semibold",
  justifyContent: "space-between",
  listStyle: "none",
  minH: "11",
  px: "3.5",
});

export function SiteHeader() {
  return (
    <nav
      class={css({
        alignItems: "center",
        borderBottomWidth: "1px",
        borderColor: "ink",
        display: "flex",
        h: "16",
        justifyContent: "space-between",
        pos: "relative",
        zIndex: 20,
      })}
    >
      <a
        class={css({
          _focus: { left: "0", top: "3" },
          alignItems: "center",
          bg: "ink",
          borderRadius: "lg",
          color: "paper",
          display: "flex",
          fontWeight: "semibold",
          left: "[-9999px]",
          minH: "11",
          pos: "absolute",
          px: "4",
          zIndex: 30,
        })}
        href="#content"
      >
        Skip to content
      </a>
      <Brand />
      <ul
        class={css({
          alignItems: "center",
          display: { base: "none", lg: "flex" },
          gap: "7",
          listStyle: "none",
        })}
      >
        <For each={groups}>
          {(group) => (
            <li>
              <button
                class={trigger}
                popovertarget={`menu-${group.id}`}
                style={`anchor-name:--menu-${group.id}`}
                type="button"
              >
                {group.label}
                <PhCaretDownBold class={caret} aria-hidden="true" />
              </button>
              <div
                class={panel}
                id={`menu-${group.id}`}
                popover="auto"
                style={`position-anchor:--menu-${group.id};position-area:bottom span-right`}
              >
                <For each={group.items}>
                  {(link) => (
                    <a class={item} href={link.href}>
                      {link.label}
                    </a>
                  )}
                </For>
              </div>
            </li>
          )}
        </For>
        <li>
          <a class={trigger} href="/pricing">
            Pricing
          </a>
        </li>
      </ul>
      <div class={css({ alignItems: "center", display: "flex", gap: "5" })}>
        <a class={trigger} href="/sign-in">
          Sign in
        </a>
        <a
          class={cx(button({ size: "sm" }), css({ display: { base: "none", sm: "inline-flex" } }))}
          href="/sign-in"
        >
          Start free
        </a>
        <button
          aria-label="Menu"
          class={cx(
            button({ size: "sm", variant: "outline" }),
            css({ display: { base: "inline-flex", lg: "none" }, minH: "11", minW: "12", px: "3" }),
          )}
          popovertarget="site-menu"
          type="button"
        >
          <PhListBold aria-hidden="true" />
        </button>
      </div>
      <div
        class={css({
          bg: "panel",
          border: "none",
          borderRadius: "2xl",
          inset: "[auto]",
          left: "4",
          m: "0",
          maxH: "[calc(100vh - 96px)]",
          overflowY: "auto",
          p: "4",
          pos: "fixed",
          right: "4",
          shadow: "paper",
          top: "[72px]",
          w: "[calc(100vw - 32px)]",
        })}
        id="site-menu"
        popover="auto"
      >
        <div
          class={css({ alignItems: "center", display: "flex", justifyContent: "space-between" })}
        >
          <a class={cx(item, css({ color: "ink", fontWeight: "semibold" }))} href="/pricing">
            Pricing
          </a>
          <button
            class={cx(item, css({ cursor: "pointer", gap: "2" }))}
            popovertarget="site-menu"
            popovertargetaction="hide"
            type="button"
          >
            Close menu <PhXBold aria-hidden="true" />
          </button>
        </div>
        <For each={groups}>
          {(group, i) => (
            <details
              class={css({ borderColor: "line", borderTopWidth: "1px", mt: "2", pt: "2" })}
              name="site-menu"
              open={i() === 0}
            >
              <summary class={groupLabel}>
                {group.label}
                <PhCaretDownBold class={caret} aria-hidden="true" />
              </summary>
              <For each={group.items}>
                {(link) => (
                  <a class={item} href={link.href}>
                    {link.label}
                  </a>
                )}
              </For>
            </details>
          )}
        </For>
      </div>
    </nav>
  );
}

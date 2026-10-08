import { For } from "solid-js";
import { css, cx } from "styled-system/css";
import PhCaretDownBold from "~icons/ph/caret-down-bold";
import PhListBold from "~icons/ph/list-bold";
import Brand from "../landing/Brand";
import { audiences, features, resources } from "../marketing/content";
import { button } from "./Button";

// The public pages' top bar. Desktop menus open on hover or keyboard focus
// with CSS alone; phones get one popover sheet with everything in it.

const groups = [
  {
    items: features.map((f) => ({ href: `/features/${f.slug}`, label: f.menu })),
    label: "Features",
  },
  { items: audiences.map((a) => ({ href: `/for/${a.slug}`, label: a.menu })), label: "Use cases" },
  { items: resources.map((r) => ({ href: r.href, label: r.menu })), label: "Resources" },
];

const trigger = css({
  _hover: { color: "ink" },
  alignItems: "center",
  color: "mut",
  cursor: "default",
  display: "flex",
  fontWeight: "medium",
  gap: "1.5",
  py: "5",
  textStyle: "sm",
  transitionDuration: "fast",
  transitionProperty: "[color]",
});

const panel = css({
  bg: "panel",
  borderRadius: "2xl",
  display: "grid",
  left: "-4",
  minW: "[240px]",
  opacity: 0,
  p: "2",
  pos: "absolute",
  scale: "[.97]",
  shadow: "paper",
  top: "[calc(100% - 6px)]",
  transformOrigin: "top left",
  // A short grace period on the way out so the pointer can cross the gap.
  transition:
    "[opacity 180ms var(--easings-smooth) 120ms, scale 180ms var(--easings-smooth) 120ms, visibility 0s 300ms]",
  translate: "[0 -4px]",
  visibility: "hidden",
  zIndex: 10,
});

const open = css({
  "&:hover > div, &:focus-within > div": {
    opacity: 1,
    scale: "[1]",
    transition:
      "[opacity 180ms var(--easings-smooth), scale 180ms var(--easings-smooth), visibility 0s]",
    translate: "[0 0]",
    visibility: "visible",
  },
  "&:hover svg, &:focus-within svg": { rotate: "[180deg]" },
  pos: "relative",
});

const item = css({
  _hover: { bg: "ink/5", color: "ink" },
  borderRadius: "lg",
  color: "[#3a3b40]",
  display: "block",
  fontSize: "15",
  px: "3.5",
  py: "2.5",
  transitionDuration: "fast",
  transitionProperty: "[background-color,color]",
  whiteSpace: "nowrap",
});

const caret = css({
  boxSize: "3",
  transitionDuration: "fast",
  transitionProperty: "[rotate]",
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
            <li class={open}>
              <button class={trigger} type="button" aria-haspopup="true">
                {group.label}
                <PhCaretDownBold class={caret} aria-hidden="true" />
              </button>
              <div class={panel}>
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
        <a class={cx(trigger, css({ cursor: "pointer" }))} href="/sign-in">
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
            css({ display: { base: "inline-flex", lg: "none" }, px: "3" }),
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
          borderRadius: "2xl",
          inset: "[auto]",
          left: "4",
          m: "0",
          maxH: "[calc(100vh - 96px)]",
          overflowY: "auto",
          p: "5",
          pos: "fixed",
          right: "4",
          shadow: "paper",
          top: "[72px]",
          w: "[calc(100vw - 32px)]",
        })}
        id="site-menu"
        popover="auto"
      >
        <a class={cx(item, css({ fontWeight: "semibold" }))} href="/pricing">
          Pricing
        </a>
        <For each={groups}>
          {(group) => (
            <div class={css({ mt: "4" })}>
              <p
                class={css({
                  color: "mut",
                  fontFamily: "mono",
                  fontSize: "11",
                  letterSpacing: "widest",
                  px: "3.5",
                  textTransform: "uppercase",
                })}
              >
                {group.label}
              </p>
              <For each={group.items}>
                {(link) => (
                  <a class={item} href={link.href}>
                    {link.label}
                  </a>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </nav>
  );
}

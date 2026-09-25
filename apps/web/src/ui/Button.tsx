import { omit } from "solid-js";
import type { ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";
import { cva } from "styled-system/css";
import type { RecipeVariantProps } from "styled-system/css";

export const button = cva({
  base: {
    "& svg": {
      boxSize: "4",
      transitionDuration: "[250ms]",
      transitionProperty: "[transform]",
      transitionTimingFunction: "smooth",
    },
    "&:hover svg": { transform: "translateX(3px)" },
    _active: { scale: "[.97]" },
    _disabled: { opacity: 0.5, pointerEvents: "none" },
    _hover: { translate: "[0 -1px]" },
    alignItems: "center",
    display: "inline-flex",
    fontWeight: "semibold",
    gap: "2.5",
    justifyContent: "center",
    rounded: "xl",
    transitionDuration: "[200ms]",
    transitionProperty: "[translate,scale,box-shadow,filter]",
    transitionTimingFunction: "smooth",
  },
  defaultVariants: {
    size: "md",
    variant: "fill",
  },
  variants: {
    size: {
      md: { fontSize: "[15px]", px: "6", py: "[15px]" },
      sm: { fontSize: "sm", px: "4", py: "[11px]" },
    },
    variant: {
      fill: {
        _hover: { filter: "[brightness(1.06)]" },
        bgGradient: "to-b",
        color: "white",
        gradientFrom: "[#3352dc]",
        gradientTo: "blue",
        shadow:
          "[inset 0 1px 0 rgba(255,255,255,.28),0 1px 2px rgba(23,24,28,.2),0 12px 28px -12px rgba(39,64,196,.7)]",
      },
      outline: {
        _hover: { bg: "white" },
        bg: "panel",
        color: "ink",
        shadow: "[inset 0 0 0 1px var(--colors-line),0 1px 2px rgba(0,0,0,.06)]",
      },
    },
  },
});

export function Button(
  props: ParentProps<
    RecipeVariantProps<typeof button> & JSX.ButtonHTMLAttributes<HTMLButtonElement>
  >,
) {
  const rest = omit(props, "children", "class", "type", "size", "style", "variant");
  return (
    <button
      {...rest}
      class={[button({ size: props.size, variant: props.variant }), props.class]}
      type={props.type ?? "button"}
      style={props.style}
    >
      {props.children}
    </button>
  );
}

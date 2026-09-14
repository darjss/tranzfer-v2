import type { ParentProps } from "solid-js";
import { cva, type VariantProps } from "./cn";

const button = cva({
  base: "inline-flex items-center justify-center gap-2.5 rounded-xl font-semibold transition-[translate,scale,box-shadow,filter] duration-200 ease-smooth hover:-translate-y-px active:scale-[.97] [&_svg]:size-4 [&_svg]:transition-transform [&_svg]:duration-250 [&_svg]:ease-smooth hover:[&_svg]:translate-x-[3px]",
  variants: {
    variant: {
      fill: "bg-linear-to-b from-[#3352dc] to-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_1px_2px_rgba(23,24,28,.2),0_12px_28px_-12px_rgba(39,64,196,.7)] hover:brightness-[1.06]",
      outline:
        "bg-panel text-ink shadow-[inset_0_0_0_1px_var(--color-line),0_1px_2px_rgba(0,0,0,.06)] hover:bg-white",
    },
    size: {
      md: "px-6 py-[15px] text-[15px]",
      sm: "px-4 py-[11px] text-sm",
    },
  },
  defaultVariants: {
    variant: "fill",
    size: "md",
  },
});

export function Button(
  props: ParentProps<
    VariantProps<typeof button> & {
      href?: string;
      class?: string;
      style?: string;
    }
  >,
) {
  return (
    <a
      class={button({ variant: props.variant, size: props.size, class: props.class })}
      href={props.href ?? "#"}
      style={props.style}
    >
      {props.children}
    </a>
  );
}

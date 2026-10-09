import type { ParentProps } from "solid-js";
import { onSettled } from "solid-js";

/**
 * Reveals `.rv`, `.ink`, `.hand` and `.chip` elements inside it as they
 * scroll into view (landing.css has the before and after states).
 */
export default function Reveal(props: ParentProps<{ class?: string }>) {
  let root: HTMLDivElement | undefined;

  onSettled(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "-40px" },
    );
    const selector = ".rv,.chip,.ink,.hand";
    for (const el of root?.querySelectorAll(selector) ?? []) {
      io.observe(el);
    }
    // Client-side navigation swaps content in place (one /for/ page to the
    // next), so elements that arrive later need observing too.
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            if (node.matches(selector)) {
              io.observe(node);
            }
            for (const el of node.querySelectorAll(selector)) {
              io.observe(el);
            }
          }
        }
      }
    });
    if (root !== undefined) {
      mo.observe(root, { childList: true, subtree: true });
    }
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  });

  return (
    <div
      class={props.class}
      ref={(el) => {
        root = el;
      }}
    >
      {props.children}
    </div>
  );
}

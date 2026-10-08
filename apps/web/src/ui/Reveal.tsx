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
    for (const el of root?.querySelectorAll(".rv,.chip,.ink,.hand") ?? []) {
      io.observe(el);
    }
    return () => {
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

import { Title } from "@solidjs/meta";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";
import { css, cx } from "styled-system/css";

// The catch-all route. httpStatus() sets the response status during SSR
// (a no-op in the browser); it runs in preload so the status code is set
// before the response head flushes.
export const route = {
  preload: () => {
    httpStatus(404);
  },
} satisfies RouteDefinition;

export default function NotFound() {
  return (
    <main class={cx("paper-dots", css({ minH: "screen", px: { base: "6", sm: "12" }, py: "16" }))}>
      <Title>Not found · Tranzfer</Title>
      <h1
        class={css({
          fontSize: "40",
          fontWeight: "semibold",
          letterSpacing: "title",
          lineHeight: "tight",
        })}
      >
        Nothing here.
      </h1>
      <p class={css({ color: "mut", mt: "3" })}>
        This page doesn't exist. If someone sent you a link, ask them for a fresh one.
      </p>
      <p class={css({ mt: "6" })}>
        <a class={css({ textDecoration: "underline" })} href="/">
          Go to Tranzfer
        </a>
      </p>
    </main>
  );
}

import { Title } from "@solidjs/meta";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";

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
    <main class="paper-dots min-h-screen px-6 py-16 sm:px-12">
      <Title>Not found · Tranzfer</Title>
      <h1 class="text-[40px] leading-tight font-semibold tracking-[-0.035em]">Nothing here.</h1>
      <p class="mt-3 text-mut">
        This page doesn't exist. If someone sent you a link, ask them for a fresh one.
      </p>
      <p class="mt-6">
        <a class="underline" href="/">
          Go to Tranzfer
        </a>
      </p>
    </main>
  );
}

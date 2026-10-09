import { useParams } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";
import { Show } from "solid-js";
import { audiences } from "../../marketing/content";
import MarketingPage from "../../marketing/MarketingPage";
import NotFound from "../[...404]";

const find = (slug: string | undefined) => audiences.find((page) => page.slug === slug);

export const route = {
  preload: ({ params }) => {
    if (find(params.slug) === undefined) {
      httpStatus(404);
    }
  },
} satisfies RouteDefinition;

export default function UseCase() {
  const params = useParams<{ slug: string }>();
  return (
    <Show when={find(params.slug)} fallback={<NotFound />}>
      {(page) => (
        <MarketingPage
          page={page()}
          path={`/for/${page().slug}`}
          related={[
            ...(page().guides ?? []),
            ...audiences
              .filter((other) => other.slug !== page().slug)
              .map((other) => ({ href: `/for/${other.slug}`, label: other.menu })),
          ]}
        />
      )}
    </Show>
  );
}

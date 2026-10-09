import { useParams } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";
import { Show } from "solid-js";
import { features } from "../../marketing/content";
import MarketingPage from "../../marketing/MarketingPage";
import NotFound from "../[...404]";

const find = (slug: string | undefined) => features.find((page) => page.slug === slug);

export const route = {
  preload: ({ params }) => {
    if (find(params.slug) === undefined) {
      httpStatus(404);
    }
  },
} satisfies RouteDefinition;

export default function Feature() {
  const params = useParams<{ slug: string }>();
  return (
    <Show when={find(params.slug)} fallback={<NotFound />}>
      {(page) => (
        <MarketingPage
          page={page()}
          path={`/features/${page().slug}`}
          related={[
            ...(page().guides ?? []),
            ...features
              .filter((other) => other.slug !== page().slug)
              .map((other) => ({ href: `/features/${other.slug}`, label: other.menu })),
          ]}
        />
      )}
    </Show>
  );
}

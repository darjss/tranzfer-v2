import { useParams } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";
import { Show } from "solid-js";
import { ContentArticle } from "../../guides/Article";
import { alternatives } from "../../guides/pages";
import NotFound from "../[...404]";

const find = (slug: string | undefined) => alternatives.find((page) => page.slug === slug);

export const route = {
  preload: ({ params }) => {
    if (find(params.slug) === undefined) {
      httpStatus(404);
    }
  },
} satisfies RouteDefinition;

export default function Alternative() {
  const params = useParams<{ slug: string }>();
  return (
    <Show when={find(params.slug)} fallback={<NotFound />}>
      {(page) => (
        <ContentArticle
          eyebrow="Alternatives"
          page={page()}
          path={`/alternatives/${page().slug}`}
          section="Alternatives"
        />
      )}
    </Show>
  );
}

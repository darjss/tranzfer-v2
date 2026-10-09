import { useParams } from "@solidjs/router";
import type { RouteDefinition } from "@solidjs/router";
import { httpStatus } from "@solidjs/web";
import { Show } from "solid-js";
import { ContentArticle } from "../../guides/Article";
import { guides } from "../../guides/pages";
import NotFound from "../[...404]";

const find = (slug: string | undefined) => guides.find((page) => page.slug === slug);

export const route = {
  preload: ({ params }) => {
    if (find(params.slug) === undefined) {
      httpStatus(404);
    }
  },
} satisfies RouteDefinition;

export default function Guide() {
  const params = useParams<{ slug: string }>();
  return (
    <Show when={find(params.slug)} fallback={<NotFound />}>
      {(page) => (
        <ContentArticle
          eyebrow="Guide"
          page={page()}
          path={`/guides/${page().slug}`}
          section="Guides"
          sectionHref="/guides"
        />
      )}
    </Show>
  );
}

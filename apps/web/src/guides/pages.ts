import * as Schema from "effect/Schema";
import { ServiceId } from "./Alternatives";

// The Markdown pages in content/, turned into data by the markdown plugin in
// vite.config.ts. A bad frontmatter field or an unknown service id fails the
// build here, before any page renders.

const Ids = Schema.Array(ServiceId);

const Page = Schema.Struct({
  /** The direct answer under the title, one or two sentences. */
  answer: Schema.String,
  body: Schema.Array(
    Schema.Union([
      Schema.Struct({ html: Schema.String, type: Schema.Literal("html") }),
      Schema.Struct({ ids: Ids, type: Schema.Literal("compare") }),
      Schema.Struct({ ids: Ids, type: Schema.Literal("ranked") }),
    ]),
  ),
  description: Schema.String,
  faq: Schema.Array(Schema.Struct({ a: Schema.String, q: Schema.String })),
  /** Position on the guides page and in the menus. */
  order: Schema.Number,
  related: Schema.Array(Schema.Struct({ href: Schema.String, label: Schema.String })),
  /** One or two sentences for the guides page and llms.txt. */
  summary: Schema.String,
  title: Schema.String,
  /** When the facts on the page were last checked. */
  updated: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
});

const Pages = Schema.Record(Schema.String, Page);

const load = (files: typeof Pages.Type) =>
  Object.entries(files)
    .map(([path, page]) => ({
      ...page,
      slug: path.slice(path.lastIndexOf("/") + 1, -".md".length),
    }))
    .toSorted((a, b) => a.order - b.order);

export const guides = load(
  Schema.decodeUnknownSync(Pages)(
    import.meta.glob("../../content/guides/*.md", { eager: true, import: "default" }),
  ),
);

export const alternatives = load(
  Schema.decodeUnknownSync(Pages)(
    import.meta.glob("../../content/alternatives/*.md", { eager: true, import: "default" }),
  ),
);

export type ContentPage = (typeof guides)[number];

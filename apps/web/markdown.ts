import type { Root, RootContent } from "hast";
import rehypeExternalLinks from "rehype-external-links";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import { matter } from "vfile-matter";
import type { Plugin } from "vite-plus";

// Markdown pages in content/ become plain data at build time: the YAML
// frontmatter plus the body as HTML blocks, so the parser never ships to the
// browser. A comment like `<!-- compare tranzfer masv -->` on its own line
// splits the body and leaves a slot the page fills with a typed component.
// src/guides/pages.ts decodes the result.

// Tables scroll sideways inside a plain div on a phone, and the first cell of
// each body row is its header, the way the hand-written tables had it.
const tables = () => (tree: Root) => {
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName === "tbody") {
      for (const row of node.children) {
        const first =
          row.type === "element" ? row.children.find((c) => c.type === "element") : undefined;
        if (first?.tagName === "td") {
          first.tagName = "th";
          first.properties.scope = "row";
        }
      }
    }
    // The walk still enters this table's rows after it moves into the div.
    if (node.tagName === "table" && parent !== undefined && index !== undefined) {
      parent.children[index] = {
        children: [node],
        properties: {},
        tagName: "div",
        type: "element",
      };
    }
  });
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeExternalLinks, { rel: ["nofollow", "noopener"] })
  .use(tables)
  .use(rehypeStringify, { allowDangerousHtml: true });

const slot = /^<!-- (?<name>\w+) (?<ids>[\w -]+) -->$/u;

export const markdown = (): Plugin => ({
  name: "tranzfer:markdown",
  transform(code, id) {
    if (!id.endsWith(".md")) {
      return null;
    }
    const file = new VFile(code);
    matter(file, { strip: true });
    const tree = processor.runSync(processor.parse(file), file);
    const body: ({ type: "html"; html: string } | { type: string; ids: string[] })[] = [];
    let group: RootContent[] = [];
    const flush = () => {
      const html = processor.stringify({ children: group, type: "root" }).trim();
      if (html !== "") {
        body.push({ html, type: "html" });
      }
      group = [];
    };
    for (const node of tree.children) {
      const match = node.type === "raw" ? slot.exec(node.value.trim())?.groups : undefined;
      if (match === undefined) {
        group.push(node);
      } else {
        flush();
        body.push({ ids: match.ids.split(" "), type: match.name });
      }
    }
    flush();
    const data = JSON.stringify(file.data.matter);
    return { code: `export default { ...${data}, body: ${JSON.stringify(body)} };`, map: null };
  },
});

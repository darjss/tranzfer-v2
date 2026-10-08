import type { ParentProps } from "solid-js";
import { HydrationScript } from "@solidjs/web";

// The document shell (the plugin's index.html replacement). Head tags that
// do not change per page live here; per-page <Title>/<Meta> come from
// @solidjs/meta inside routes.
export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta name="theme-color" content="#f3efe6" />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}

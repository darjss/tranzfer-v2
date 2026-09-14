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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400;0,500;0,600;0,700;1,600&family=IBM+Plex+Mono:wght@400;500&family=Caveat:wght@500;600&display=swap"
        />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}

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
        <meta property="og:site_name" content="Tranzfer" />
        <meta property="og:image" content="https://tranzfer.app/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content="Tranzfer: send the whole card, built to resume. A 463 GB delivery resuming after the Wi-Fi came back."
        />
        <meta name="twitter:card" content="summary_large_image" />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}

import { Meta } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { clientOnly, getRequestEvent, isServer } from "@solidjs/web";
import { css } from "styled-system/css";

import Brand from "../../landing/Brand";
import Loader, { linkQuips } from "../../ui/Loader";
import { Paper } from "../../ui/Paper";

// Uppy and the window listeners are browser-only, so the page mounts on the
// client; the server renders the shell.
const LazyPortal = clientOnly(async () => {
  const { Portal } = await import("../../portal/Portal");
  return { default: Portal };
});

export default function RequestPage() {
  const params = useParams<{ token: string }>();
  // The address is a credential, so keep this page out of search results
  // and caches. robots.txt disallows /r/ as well.
  if (isServer) {
    const headers = getRequestEvent()?.response.headers;
    headers?.set("cache-control", "no-store");
    headers?.set("x-robots-tag", "noindex, nofollow");
  }
  return (
    <div
      class={css({
        marginInline: "auto",
        maxW: "page",
        minH: "screen",
        pb: "24",
        px: { base: "5", sm: "7" },
      })}
    >
      <Meta name="description" content="Upload files to someone through Tranzfer." />
      <Meta name="robots" content="noindex" />
      <nav
        class={css({
          alignItems: "center",
          borderBottomWidth: "1px",
          borderColor: "ink",
          display: "flex",
          h: "16",
        })}
      >
        <Brand />
      </nav>
      <main class={css({ pt: { base: "10", sm: "16" } })}>
        <LazyPortal
          fallback={
            <Paper>
              <Loader quips={linkQuips} />
            </Paper>
          }
          token={params.token}
        />
      </main>
    </div>
  );
}

import { Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { clientOnly, getRequestEvent, isServer } from "@solidjs/web";
import { LinkExpired, LinkNotFound, LinkNotReady } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import {
  createMemo,
  createSignal,
  Errored,
  For,
  Loading,
  Match,
  Show,
  Switch,
  useContext,
} from "solid-js";
import { css, cx } from "styled-system/css";

import { ApiClient } from "../../api/client";
import { runEffect, RuntimeContext } from "../../api/solid-effect";
import { bytes, items, untilDate } from "../../dashboard/format";
import Brand from "../../landing/Brand";

const errorSection = css({
  marginInline: "auto",
  maxW: "[720px]",
  px: { base: "6", sm: "12" },
  py: "10",
});
const errorTitle = css({
  fontSize: "[36px]",
  fontWeight: "semibold",
  letterSpacing: "[-0.03em]",
  lineHeight: "tight",
});

const LinkError = (props: { error: unknown }) => (
  <Switch>
    <Match when={props.error instanceof LinkNotReady ? props.error : null}>
      {(current) => (
        <section class={errorSection}>
          <p class={css({ color: "mut", fontFamily: "mono", fontSize: "xs" })}>
            from {current().senderName}
          </p>
          <h1 class={cx(errorTitle, css({ mt: "2" }))}>{current().title}</h1>
          <p class={css({ color: "blue", mt: "3" })}>
            Still uploading. This link starts working once every file is finished.
          </p>
        </section>
      )}
    </Match>
    <Match when={props.error instanceof LinkExpired ? props.error : null}>
      {(current) => (
        <section class={errorSection}>
          <h1 class={errorTitle}>{current().title}</h1>
          <p class={css({ color: "mut", mt: "3" })}>Expired on {untilDate(current().expiredAt)}.</p>
        </section>
      )}
    </Match>
    <Match when={true}>
      <section class={errorSection}>
        <h1 class={errorTitle}>This link doesn't work.</h1>
        <p class={css({ color: "mut", mt: "3" })}>
          {props.error instanceof LinkNotFound
            ? "It may have been cancelled."
            : "Something went wrong opening it. Try again in a moment."}
        </p>
      </section>
    </Match>
  </Switch>
);

const LinkPage = () => {
  const params = useParams<{ token: string }>();
  const runtime = useContext(RuntimeContext);
  const delivery = createMemo(() =>
    runEffect(ApiClient.pipe(Effect.flatMap((api) => api.OpenLink({ token: params.token })))),
  );
  const total = () => (delivery()?.files ?? []).reduce((sum, file) => sum + file.size, 0);

  // Rendered URLs expire, so a click re-opens the link for a fresh one and
  // surfaces a dead link the same way the load-time boundary does.
  const [linkError, setLinkError] = createSignal<unknown>();
  const download = async (path: string) => {
    if (runtime === undefined) {
      return;
    }
    try {
      const fresh = await runtime.runPromise(
        ApiClient.pipe(Effect.flatMap((api) => api.OpenLink({ token: params.token }))),
      );
      const file = fresh.files.find((candidate) => candidate.path === path);
      if (file !== undefined) {
        location.assign(file.url);
      }
    } catch (error) {
      setLinkError(error);
    }
  };

  return (
    <main class={cx("paper-dots", css({ minH: "screen" }))}>
      <Meta name="description" content="Download files shared with you through Tranzfer." />
      <nav
        class={css({ alignItems: "center", display: "flex", h: "16", px: { base: "6", sm: "12" } })}
      >
        <Brand />
      </nav>
      <Loading
        fallback={
          <div class={css({ color: "mut", fontSize: "sm", px: { base: "6", sm: "12" }, py: "16" })}>
            Loading…
          </div>
        }
      >
        <Errored fallback={(error) => <LinkError error={error()} />}>
          <Show
            when={linkError()}
            fallback={
              <section class={errorSection}>
                <Title>{delivery()?.title ?? "Tranzfer"}</Title>
                <h1 class={errorTitle}>{delivery()?.title}</h1>
                <p class={css({ color: "mut", mt: "2" })}>
                  from{" "}
                  <b class={css({ color: "ink", fontWeight: "medium" })}>
                    {delivery()?.senderName}
                  </b>{" "}
                  · {items(delivery()?.files.length ?? 0)} · {bytes(total())}
                </p>
                <Show when={delivery()?.expiresAt ?? null}>
                  {(expiresAt) => (
                    <p class={css({ color: "mut", fontSize: "sm", mt: "1" })}>
                      Available until {untilDate(expiresAt())}
                    </p>
                  )}
                </Show>

                <ul
                  class={css({
                    borderBottomWidth: "1px",
                    borderColor: "line",
                    borderTopWidth: "1px",
                    divideColor: "line/70",
                    divideY: "1px",
                    mt: "8",
                  })}
                >
                  <For each={delivery()?.files ?? []}>
                    {(file) => (
                      <li
                        class={css({
                          alignItems: "center",
                          columnGap: "4",
                          display: "grid",
                          gridTemplateColumns: "[1fr 80px auto]",
                          py: "3",
                        })}
                      >
                        <span class={css({ fontFamily: "mono", fontSize: "sm", truncate: true })}>
                          {file.path}
                        </span>
                        <span
                          class={css({
                            color: "mut",
                            fontFamily: "mono",
                            fontSize: "sm",
                            textAlign: "right",
                          })}
                        >
                          {bytes(file.size)}
                        </span>
                        <a
                          class={css({
                            _hover: { translate: "[0 -1px]" },
                            alignItems: "center",
                            bg: "ink",
                            borderRadius: "xl",
                            color: "paper",
                            display: "inline-flex",
                            fontSize: "sm",
                            fontWeight: "semibold",
                            gap: "2",
                            px: "4",
                            py: "2",
                            transitionProperty: "[transform,translate,scale,rotate]",
                          })}
                          href={file.url}
                          onClick={(event) => {
                            event.preventDefault();
                            void download(file.path);
                          }}
                        >
                          Download
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
                <p class={css({ color: "mut", fontSize: "sm", mt: "4" })}>
                  Interrupted downloads can resume in your browser's download manager while the link
                  is fresh.
                </p>
              </section>
            }
          >
            {(error) => <LinkError error={error()} />}
          </Show>
        </Errored>
      </Loading>
    </main>
  );
};

// Schema class instances cannot cross the SSR hydration boundary, so the
// page mounts client-side only; the server renders the loading shell.
const LazyLink = clientOnly(async () => await Promise.resolve({ default: LinkPage }));

export default function PublicDelivery() {
  // Signed URLs are rendered into the HTML, so the page must never be cached.
  if (isServer) {
    getRequestEvent()?.response.headers.set("cache-control", "no-store");
  }
  return (
    <LazyLink
      fallback={
        <main class={cx("paper-dots", css({ minH: "screen" }))}>
          <div class={css({ color: "mut", fontSize: "sm", px: { base: "6", sm: "12" }, py: "16" })}>
            Loading…
          </div>
        </main>
      }
    />
  );
}

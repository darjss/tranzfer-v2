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

import { ApiClient } from "../../api/client";
import { runEffect, RuntimeContext } from "../../api/solid-effect";
import { bytes, items, untilDate } from "../../dashboard/format";
import Brand from "../../landing/Brand";

const LinkError = (props: { error: unknown }) => (
  <Switch>
    <Match when={props.error instanceof LinkNotReady ? props.error : null}>
      {(current) => (
        <section class="mx-auto max-w-[720px] px-6 py-10 sm:px-12">
          <p class="font-mono text-xs text-mut">from {current().senderName}</p>
          <h1 class="mt-2 text-[36px] leading-tight font-semibold tracking-[-0.03em]">
            {current().title}
          </h1>
          <p class="mt-3 text-blue">
            Still uploading. This link starts working once every file is finished.
          </p>
        </section>
      )}
    </Match>
    <Match when={props.error instanceof LinkExpired ? props.error : null}>
      {(current) => (
        <section class="mx-auto max-w-[720px] px-6 py-10 sm:px-12">
          <h1 class="text-[36px] leading-tight font-semibold tracking-[-0.03em]">
            {current().title}
          </h1>
          <p class="mt-3 text-mut">Expired on {untilDate(current().expiredAt)}.</p>
        </section>
      )}
    </Match>
    <Match when={true}>
      <section class="mx-auto max-w-[720px] px-6 py-10 sm:px-12">
        <h1 class="text-[36px] leading-tight font-semibold tracking-[-0.03em]">
          This link doesn't work.
        </h1>
        <p class="mt-3 text-mut">
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
    <main class="paper-dots min-h-screen">
      <Meta name="description" content="Download files shared with you through Tranzfer." />
      <nav class="flex h-16 items-center px-6 sm:px-12">
        <Brand />
      </nav>
      <Loading fallback={<div class="px-6 py-16 text-sm text-mut sm:px-12">Loading…</div>}>
        <Errored fallback={(error) => <LinkError error={error()} />}>
          <Show
            when={linkError()}
            fallback={
              <section class="mx-auto max-w-[720px] px-6 py-10 sm:px-12">
                <Title>{delivery()?.title ?? "Tranzfer"}</Title>
                <h1 class="text-[36px] leading-tight font-semibold tracking-[-0.03em]">
                  {delivery()?.title}
                </h1>
                <p class="mt-2 text-mut">
                  from <b class="font-medium text-ink">{delivery()?.senderName}</b> ·{" "}
                  {items(delivery()?.files.length ?? 0)} · {bytes(total())}
                </p>
                <Show when={delivery()?.expiresAt ?? null}>
                  {(expiresAt) => (
                    <p class="mt-1 text-sm text-mut">Available until {untilDate(expiresAt())}</p>
                  )}
                </Show>

                <ul class="mt-8 divide-y divide-line/70 border-y border-line">
                  <For each={delivery()?.files ?? []}>
                    {(file) => (
                      <li class="grid grid-cols-[1fr_80px_auto] items-center gap-4 py-3">
                        <span class="truncate font-mono text-sm">{file.path}</span>
                        <span class="text-right font-mono text-sm text-mut">
                          {bytes(file.size)}
                        </span>
                        <a
                          class="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper transition-transform hover:-translate-y-px"
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
                <p class="mt-4 text-sm text-mut">
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
        <main class="paper-dots min-h-screen">
          <div class="px-6 py-16 text-sm text-mut sm:px-12">Loading…</div>
        </main>
      }
    />
  );
}

import { Meta, Title } from "@solidjs/meta";
import { Unauthorized } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import { createMemo, Errored, Loading, Show } from "solid-js";

import { ApiClient } from "../api/client";
import { runEffect } from "../api/solid-effect";

export default function Me() {
  const me = createMemo(() => runEffect(ApiClient.pipe(Effect.flatMap((api) => api.Me()))));
  return (
    <main class="flex min-h-screen items-center justify-center px-6">
      <Title>Me — Tranzfer</Title>
      <Meta name="description" content="Your Tranzfer account." />
      <div class="w-full max-w-sm rounded-xl bg-panel p-8 text-center shadow-[inset_0_0_0_1px_var(--color-line),0_1px_2px_rgba(0,0,0,.06)]">
        <Loading fallback={<p class="text-sm text-mut">Loading…</p>}>
          <Errored
            fallback={(error, retry) => (
              <Show
                when={error() instanceof Unauthorized}
                fallback={
                  <div role="alert">
                    <p class="text-sm text-mut">We couldn't load your account.</p>
                    <button class="mt-3 text-ink underline" onClick={retry} type="button">
                      Try again
                    </button>
                  </div>
                }
              >
                <p class="text-sm text-mut">
                  Not signed in.{" "}
                  <a class="text-ink underline" href="/sign-in">
                    Sign in
                  </a>
                </p>
              </Show>
            )}
          >
            <h1 class="text-2xl font-semibold text-ink">{me().name}</h1>
            <p class="mt-2 text-sm text-mut">{me().email}</p>
          </Errored>
        </Loading>
      </div>
    </main>
  );
}

import { Meta, Title } from "@solidjs/meta";
import * as Effect from "effect/Effect";
import { createMemo, Errored, Loading } from "solid-js";

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
            fallback={
              <p class="text-sm text-mut">
                Not signed in.{" "}
                <a class="text-ink underline" href="/sign-in">
                  Sign in
                </a>
              </p>
            }
          >
            <h1 class="text-2xl font-semibold text-ink">{me().name}</h1>
            <p class="mt-2 text-sm text-mut">{me().email}</p>
          </Errored>
        </Loading>
      </div>
    </main>
  );
}

import { Meta, Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { clientOnly, isServer } from "@solidjs/web";
import type { ManagedRuntime } from "effect/ManagedRuntime";
import { Unauthorized } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import { createMemo, Errored, Loading, onSettled, Show, useContext } from "solid-js";

import { ApiClient } from "../api/client";
import { runEffect, RuntimeContext } from "../api/solid-effect";
import { DeliveryPane } from "../dashboard/DeliveryPane";
import { NewDeliveryPane } from "../dashboard/NewDeliveryPane";
import { Sidebar } from "../dashboard/Sidebar";
import { deliveriesVersion, online } from "../uploads/store";
import { getUploads } from "../uploads/uppy";

const Redirect = (props: { to: string }) => {
  const navigate = useNavigate();
  onSettled(() => {
    navigate(props.to, { replace: true });
  });
  return null;
};

const runtimeOrThrow = (runtime: ManagedRuntime<ApiClient, never> | undefined) => {
  if (runtime === undefined) {
    throw new Error("RuntimeContext is not provided");
  }
  return runtime;
};

const DeliveriesPage = () => {
  const runtime = runtimeOrThrow(useContext(RuntimeContext));
  // The upload engine is client-only; constructing it touches window.
  if (!isServer) {
    getUploads(runtime);
  }

  const [searchParams, setSearchParams] = useSearchParams<{ d?: string }>();
  const select = (id: string | undefined) => {
    setSearchParams({ d: id });
  };

  const me = createMemo(() => runEffect(ApiClient.pipe(Effect.flatMap((api) => api.Me()))));
  const deliveries = createMemo(() => {
    deliveriesVersion();
    return runEffect(ApiClient.pipe(Effect.flatMap((api) => api.Deliveries())));
  });
  const selected = () => {
    const id = searchParams.d;
    return id === undefined ? undefined : deliveries()?.find((d) => d.id === id);
  };

  return (
    <>
      <Title>Deliveries — Tranzfer</Title>
      <Meta name="description" content="Your Tranzfer deliveries." />
      <Loading fallback={<main class="min-h-screen" />}>
        <Errored
          fallback={(error, retry) => (
            <Show
              when={error() instanceof Unauthorized}
              fallback={
                <main class="grid min-h-screen place-items-center" role="alert">
                  <div class="text-center">
                    <p class="text-sm text-mut">We couldn't load your deliveries.</p>
                    <button class="mt-3 text-ink underline" onClick={retry} type="button">
                      Try again
                    </button>
                  </div>
                </main>
              }
            >
              <Redirect to="/sign-in" />
            </Show>
          )}
        >
          <div class="flex min-h-screen flex-col lg:grid lg:grid-cols-[300px_1fr]">
            <Sidebar
              deliveries={deliveries()}
              online={online()}
              principal={me()}
              select={select}
              selectedId={searchParams.d}
            />
            <main class="paper-dots min-h-screen max-lg:order-1">
              <Show when={!online()}>
                <p class="border-b border-line bg-panel px-6 py-2.5 text-sm text-amber sm:px-12">
                  Connection lost. We'll continue when you're back online.
                </p>
              </Show>
              <Show
                when={selected()}
                fallback={<NewDeliveryPane runtime={runtime} select={select} />}
              >
                {(delivery) => (
                  <DeliveryPane delivery={delivery()} online={online()} runtime={runtime} />
                )}
              </Show>
            </main>
          </div>
        </Errored>
      </Loading>
    </>
  );
};

// Schema class instances cannot cross the SSR hydration boundary, so the
// page mounts client-side only; the server renders the loading shell.
const LazyDeliveries = clientOnly(async () => await Promise.resolve({ default: DeliveriesPage }));

export default function Deliveries() {
  return <LazyDeliveries fallback={<main class="min-h-screen" />} />;
}

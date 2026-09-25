import { Meta, Title } from "@solidjs/meta";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { clientOnly, isServer } from "@solidjs/web";
import type { ManagedRuntime } from "effect/ManagedRuntime";
import { Unauthorized } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import { createMemo, Errored, Loading, onSettled, Show, useContext } from "solid-js";
import { css, cx } from "styled-system/css";

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
      <Loading fallback={<main class={css({ minH: "screen" })} />}>
        <Errored
          fallback={(error, retry) => (
            <Show
              when={error() instanceof Unauthorized}
              fallback={
                <main
                  class={css({ display: "grid", minH: "screen", placeItems: "center" })}
                  role="alert"
                >
                  <div class={css({ textAlign: "center" })}>
                    <p class={css({ color: "mut", fontSize: "sm" })}>
                      We couldn't load your deliveries.
                    </p>
                    <button
                      class={css({ color: "ink", mt: "3", textDecoration: "underline" })}
                      onClick={retry}
                      type="button"
                    >
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
          <div
            class={css({
              display: "flex",
              flexDir: "column",
              lg: { display: "grid", gridTemplateColumns: "[300px 1fr]" },
              minH: "screen",
            })}
          >
            <Sidebar
              deliveries={deliveries()}
              online={online()}
              principal={me()}
              select={select}
              selectedId={searchParams.d}
            />
            <main class={cx("paper-dots", css({ lgDown: { order: "1" }, minH: "screen" }))}>
              <Show when={!online()}>
                <p
                  class={css({
                    bg: "panel",
                    borderBottomWidth: "1px",
                    borderColor: "line",
                    color: "amber",
                    fontSize: "sm",
                    px: { base: "6", sm: "12" },
                    py: "2.5",
                  })}
                >
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
  return <LazyDeliveries fallback={<main class={css({ minH: "screen" })} />} />;
}

import type { DeliveryId, RequestUpload } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { action, createMemo, createOptimistic, createOptimisticStore, refresh } from "solid-js";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { runEffect } from "../api/solid-effect";
import type { AppServices } from "../api/solid-effect";
import { rereadWhenSettled } from "../dashboard/deliveries";
import { Uploads } from "../uploads/uploads";
import type { ChosenFile } from "../uploads/uploads";

/**
 * An uploader's side of a file request: the request they opened, the uploads
 * this browser made through it, and the action that sends more. Everything
 * goes through the token, because they have no account.
 */
export const createPortal = (
  runtime: ManagedRuntime.ManagedRuntime<AppServices, never>,
  token: () => string,
) => {
  const request = createMemo(() =>
    runEffect(ApiClient.use((api) => api.OpenFileRequest({ token: token() }))),
  );

  // Uploads sent since this page opened. They finish and drop out of the
  // browser's recovery records, so the re-read has to ask for them by id.
  const sentHere: DeliveryId[] = [];
  const [uploads, setUploads] = createOptimisticStore<RequestUpload[]>(
    () =>
      runEffect(
        Uploads.use((engine) =>
          engine.recoverRequest(token(), sentHere).pipe(Effect.map((list) => [...list])),
        ),
      ),
    [],
    { key: "id" },
  );
  rereadWhenSettled(uploads, () => {
    void refresh(uploads);
  });

  const [sending, setSending] = createOptimistic(false);

  /** Resolves to a problem to show, or undefined once the upload is under way. */
  const send = action(async function* send(
    chosen: readonly ChosenFile[],
    who: { readonly email: string | null; readonly name: string },
  ) {
    setSending(true);
    const exit = await runtime.runPromiseExit(
      Uploads.use((engine) => engine.sendToRequest(chosen, { ...who, token: token() })),
    );
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (Exit.isSuccess(exit)) {
      const created = exit.value;
      sentHere.push(created.id);
      setUploads((list) => {
        list.unshift(created);
      });
      void refresh(uploads);
    }
    return failure;
  });

  return { request, send, sending, uploads };
};

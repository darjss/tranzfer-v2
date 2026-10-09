import type { FileRequest, NewFileRequest, RequestId } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as ManagedRuntime from "effect/ManagedRuntime";
import { action, createOptimisticStore, refresh } from "solid-js";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { runEffect } from "../api/solid-effect";
import type { AppServices } from "../api/solid-effect";
import { retryTransport } from "../uploads/uploads";

/**
 * The owner's file requests and the actions that change them. Each action
 * resolves to a problem to show, or undefined when it went through.
 */
export const createRequests = (runtime: ManagedRuntime.ManagedRuntime<AppServices, never>) => {
  // The server list, overlaid by the actions below: a new request shows up
  // and a closed one reads closed the moment it happens, then the re-read
  // reconciles.
  const [requests, setRequests] = createOptimisticStore<FileRequest[]>(
    () =>
      runEffect(
        ApiClient.use((api) =>
          retryTransport(api.FileRequests()).pipe(Effect.map((list) => [...list])),
        ),
      ),
    [],
    { key: "id" },
  );

  const create = action(async function* create(input: NewFileRequest) {
    const exit = await runtime.runPromiseExit(ApiClient.use((api) => api.CreateFileRequest(input)));
    yield;
    const failure = Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
    if (Exit.isSuccess(exit)) {
      const created = exit.value;
      setRequests((list) => {
        list.unshift(created);
      });
      void refresh(requests);
    }
    return failure;
  });

  const close = action(async function* close(requestId: RequestId) {
    setRequests((list) => {
      // Object.assign because the contract types are readonly.
      const row = list.find((request) => request.id === requestId);
      if (row !== undefined) {
        Object.assign(row, { status: "closed" });
      }
    });
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.CloseFileRequest({ requestId })),
    );
    yield;
    void refresh(requests);
    return Exit.isFailure(exit) ? appError(exit.cause).message : undefined;
  });

  return { close, create, requests };
};

import type { ManagedRuntime } from "effect/ManagedRuntime";
import { createSignal, For, Show } from "solid-js";

import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";

import { DeliveryConflict } from "@tranzfer/contracts";

import type { ApiClient } from "../api/client";
import { chosenFiles, getDroppedFiles, invalidPaths, sendFiles } from "../uploads/uppy";
import { retentionChoices } from "./format";

interface Props {
  readonly runtime: ManagedRuntime<ApiClient, never>;
  readonly select: (id: string | undefined) => void;
}

export function NewDeliveryPane(props: Props) {
  const [dragging, setDragging] = createSignal(false);
  const [retention, setRetention] = createSignal<1 | 3 | 7 | 14>(3);
  const [sending, setSending] = createSignal(false);
  const [problems, setProblems] = createSignal<readonly string[]>([]);
  let filesInput: HTMLInputElement | undefined;
  let folderInput: HTMLInputElement | undefined;

  const send = async (files: Iterable<File>) => {
    if (sending()) {
      return;
    }
    const chosen = chosenFiles(files);
    if (chosen.length === 0) {
      return;
    }
    const bad = invalidPaths(chosen);
    if (bad.length > 0) {
      setProblems(bad.map((path) => `"${path}" isn't a path we can carry safely.`));
      return;
    }
    setProblems([]);
    setSending(true);
    try {
      const delivery = await sendFiles(props.runtime, chosen, retention());
      props.select(delivery.id);
    } catch (error) {
      setProblems([
        error instanceof DeliveryConflict
          ? "That delivery already exists. Refresh and pick it from the list."
          : "The delivery couldn't be created. Nothing was uploaded — try again.",
      ]);
    } finally {
      setSending(false);
    }
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer === null) {
      return;
    }
    await send(await getDroppedFiles(event.dataTransfer));
  };

  return (
    <section class="max-w-[860px] px-6 py-10 sm:px-12">
      <h1 class="text-[40px] leading-tight font-semibold tracking-[-0.035em]">
        Send something big.
      </h1>

      <div class="relative mt-8">
        <p class="absolute -top-10 right-4 z-10 rotate-[-4deg] font-hand text-2xl leading-tight font-semibold text-blue/80 select-none">
          <span class="max-sm:hidden">the whole folder is fine, we keep its structure</span>
          <span class="text-lg whitespace-nowrap sm:hidden">folders keep their structure</span>
        </p>
        <div
          class={[
            "grid min-h-[320px] place-items-center rounded-3xl border-2 border-dashed text-center transition-[border-color,scale] duration-300 ease-smooth motion-reduce:transition-none",
            dragging()
              ? "scale-[1.01] border-solid border-blue [--dots-ink:rgb(39_64_196/.35)]"
              : "border-ink/25",
          ]}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={(event) => {
            void onDrop(event);
          }}
          role="button"
          tabindex={0}
          aria-label="Drop a folder or files to upload"
        >
          <div class="pointer-events-none flex flex-col items-center gap-3 px-6">
            <span class="grid size-12 place-items-center rounded-2xl bg-ink text-paper">
              <PhUploadSimpleBold class="size-6" />
            </span>
            <p class="text-[17px] font-semibold">Drop a folder or files</p>
            <p class="text-sm text-mut">
              or{" "}
              <button
                class="pointer-events-auto text-ink underline underline-offset-2"
                onClick={() => filesInput?.click()}
                type="button"
              >
                choose files
              </button>{" "}
              ·{" "}
              <button
                class="pointer-events-auto text-ink underline underline-offset-2"
                onClick={() => folderInput?.click()}
                type="button"
              >
                choose a folder
              </button>
            </p>
          </div>
        </div>
        <input
          class="hidden"
          multiple
          onChange={(event) => {
            const input = event.currentTarget;
            void send([...(input.files ?? [])]);
            input.value = "";
          }}
          ref={(element) => {
            filesInput = element;
          }}
          type="file"
        />
        <input
          class="hidden"
          onChange={(event) => {
            const input = event.currentTarget;
            void send([...(input.files ?? [])]);
            input.value = "";
          }}
          ref={(element) => {
            folderInput = element;
          }}
          type="file"
          webkitdirectory=""
        />
      </div>

      <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset class="flex items-center gap-2">
          <legend class="sr-only">Keep files for</legend>
          <span class="text-sm font-medium">Keep files for</span>
          <For each={retentionChoices}>
            {(days) => (
              <label
                class={[
                  "cursor-pointer rounded-full px-3 py-1 font-mono text-sm ring-1 transition-colors",
                  retention() === days
                    ? "bg-ink text-paper ring-ink"
                    : "text-ink ring-line hover:bg-panel",
                ]}
              >
                <input
                  checked={retention() === days}
                  class="sr-only"
                  name="retention"
                  onChange={() => {
                    setRetention(days);
                  }}
                  type="radio"
                  value={String(days)}
                />
                {days}d
              </label>
            )}
          </For>
        </fieldset>
        <span class="ml-auto font-mono text-xs text-mut">
          counted from when the upload finishes
        </span>
      </div>

      <Show when={sending()}>
        <p class="mt-4 text-sm text-mut">Setting the delivery up…</p>
      </Show>
      <Show when={problems().length > 0}>
        <div class="mt-4" role="alert">
          <For each={problems()}>{(problem) => <p class="text-sm text-rust">{problem}</p>}</For>
        </div>
      </Show>
    </section>
  );
}

import type { SharedDelivery } from "@tranzfer/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { createSignal, createStore, onSettled, Show, useContext } from "solid-js";
import { css, cx } from "styled-system/css";

import PhCheckCircleBold from "~icons/ph/check-circle-bold";
import PhFolderSimpleBold from "~icons/ph/folder-simple-bold";

import { appError } from "../api/errors";
import type { ApiError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { bytes, files } from "../dashboard/format";
import { Progress } from "../dashboard/parts";
import { button } from "../ui/Button";
import { saveFolder } from "./save-folder";
import type { Folder, SaveStopped } from "./save-folder";

const note = css({ color: "mut", mt: "2.5", textStyle: "sm" });
const mono = css({ fontFamily: "mono", fontSize: "13", fontVariantNumeric: "tabular-nums" });

const stoppedWords = (error: ApiError | SaveStopped) => {
  if (error._tag === "SaveStopped") {
    return error.reason === "disk"
      ? `Couldn't save ${error.path}. Check the folder has space, then resume.`
      : "We lost the connection. Resume when you're back online.";
  }
  return appError(error).message;
};

/** Saves every file into one picked folder, subfolders included. Chromium only. */
export const SaveAll = (props: { delivery: SharedDelivery; token: string }) => {
  const runtime = useContext(RuntimeContext);
  const total = () => props.delivery.files.reduce((sum, file) => sum + file.size, 0);
  const [status, setStatus] = createSignal<"done" | "idle" | "saving">("idle");
  const [problem, setProblem] = createSignal<string>();
  const [progress, setProgress] = createStore({ bytes: 0, current: "", files: 0, folder: "" });
  // Kept so Resume skips the picker. A reload forgets it; picking the same
  // folder again finds what is already there.
  let folder: Folder | undefined;
  let stop: AbortController | undefined;
  onSettled(() => () => stop?.abort());

  const start = async (picker: NonNullable<Window["showDirectoryPicker"]>) => {
    if (folder === undefined) {
      const picked = await runtime.runPromiseExit(
        Effect.tryPromise(
          async () => await picker({ id: "tranzfer", mode: "readwrite", startIn: "downloads" }),
        ),
      );
      // Closing the picker rejects with AbortError; there is nothing to say.
      if (Exit.isFailure(picked)) {
        return;
      }
      folder = picked.value;
    }
    const root = folder;
    setProblem();
    setStatus("saving");
    setProgress((draft) => {
      draft.folder = root.name;
    });
    stop = new AbortController();
    const exit = await runtime.runPromiseExit(
      saveFolder(root, props.token, (next) => {
        setProgress((draft) => {
          draft.bytes = next.bytes;
          draft.current = next.current;
          draft.files = next.files;
        });
      }),
      { signal: stop.signal },
    );
    if (Exit.isSuccess(exit)) {
      setStatus("done");
      return;
    }
    if (Cause.hasInterruptsOnly(exit.cause)) {
      return;
    }
    // A defect has no typed error; it reads as the generic retryable words.
    const error = Cause.findErrorOption(exit.cause);
    setProblem(Option.isSome(error) ? stoppedWords(error.value) : appError(exit.cause).message);
    setStatus("idle");
  };

  return (
    <div class={css({ mt: "6" })}>
      <Show
        when={window.showDirectoryPicker}
        fallback={
          <p class={css({ color: "mut", textStyle: "sm" })}>
            This browser can't save a whole folder. Open this link in Chrome or Edge to download
            everything at once, folders included.
          </p>
        }
      >
        {(picker) => (
          // Three small panes rendered once and shown by status: rebuilding a
          // subtree on each flip blew the HOT_SCOPE_TIME budget on slow CI.
          <>
            <div hidden={status() !== "idle"}>
              <button
                class={button({ size: "sm" })}
                onClick={() => {
                  void start(picker());
                }}
                type="button"
              >
                <PhFolderSimpleBold aria-hidden="true" />
                {problem() === undefined ? "Download all" : "Resume"}
              </button>
              <Show
                when={problem()}
                fallback={
                  <p class={note}>
                    Choose a folder and every file lands in it, subfolders included. If it stops,
                    choose the same folder again to carry on.
                  </p>
                }
              >
                {(message) => (
                  <p class={css({ color: "rust", mt: "2.5", textStyle: "sm" })} role="alert">
                    {message()}
                  </p>
                )}
              </Show>
            </div>
            <div hidden={status() !== "saving"}>
              <Progress
                confirmed={progress.bytes}
                inFlight={0}
                kind="moving"
                label={`Saving to ${progress.folder}`}
                thick
                total={total()}
              />
              <p class={cx(mono, css({ mt: "2.5" }))}>
                {progress.files} of {files(props.delivery.files.length)} · {bytes(progress.bytes)}{" "}
                of {bytes(total())}
              </p>
              <p
                class={cx(mono, css({ color: "mut", mt: "1", truncate: true }))}
                title={progress.current}
              >
                {progress.current}
              </p>
            </div>
            <div hidden={status() !== "done"}>
              <p
                class={css({ alignItems: "center", color: "ok", display: "flex", gap: "2" })}
                role="status"
              >
                <PhCheckCircleBold aria-hidden="true" class={css({ boxSize: "4" })} />
                All {files(props.delivery.files.length)} are in {progress.folder}.
              </p>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

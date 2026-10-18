import type { Delivery } from "@tranzfer/contracts";
import * as Exit from "effect/Exit";
import { createSignal, For, Show, useContext } from "solid-js";
import { css } from "styled-system/css";

import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { Button } from "../ui/Button";
import { Uploads } from "../uploads/uploads";
import { bytes } from "./format";
import { sheetBlock, sheetHeading } from "./parts";

const resumeProblem = (
  problem: "changed" | "gone" | "policy" | "unreadable" | "unknown",
  name: string,
) => {
  if (problem === "unknown") {
    return `"${name}" isn't one of the files this delivery is waiting for.`;
  }
  if (problem === "changed") {
    return `"${name}" has changed since you sent it, so we won't continue with it.`;
  }
  if (problem === "unreadable") {
    return `"${name}" couldn't be read. Pick it again.`;
  }
  if (problem === "gone") {
    return `"${name}" can't continue because its partial upload is gone from storage. Cancel and send it again.`;
  }
  return `"${name}" was started by an older version of Tranzfer and can't continue. Cancel and send it again.`;
};

/** Lets the sender pick the same files again to continue an interrupted upload. */
export function ResumeUpload(props: { confirmed: number; delivery: Delivery; needsFile: boolean }) {
  const runtime = useContext(RuntimeContext);
  const [resumeProblems, setResumeProblems] = createSignal<readonly string[]>([]);
  const [checking, setChecking] = createSignal<{ checked: number; total: number }>();
  // Folder picks matter only when a transfer actually sits in one.
  const hasNestedPaths = () =>
    props.delivery.transfers.some((transfer) => transfer.path.includes("/"));
  let resumeFiles: HTMLInputElement | undefined;
  let resumeFolder: HTMLInputElement | undefined;

  const resumePicked = async (input: HTMLInputElement) => {
    const picked = [...(input.files ?? [])];
    input.value = "";
    if (picked.length === 0) {
      return;
    }
    const { delivery } = props;
    // Verifying a reselected file hashes every stored part, so a big file can
    // hold the pick for minutes; the block must say why it is waiting.
    setChecking({ checked: 0, total: 0 });
    const exit = await runtime.runPromiseExit(
      Uploads.use((uploads) =>
        uploads.resume(delivery, picked, (progress) => {
          setChecking(progress);
        }),
      ),
    );
    setChecking(undefined);
    setResumeProblems(
      Exit.isSuccess(exit)
        ? exit.value.map(({ name, problem: tag }) => resumeProblem(tag, name))
        : [appError(exit.cause).message],
    );
  };

  return (
    <Show when={props.needsFile}>
      <section class={sheetBlock}>
        <h3 class={sheetHeading}>Continue the upload</h3>
        <p class={css({ color: "ink/80", mt: "2", textStyle: "sm" })}>
          {bytes(props.confirmed)} already uploaded.
        </p>
        <div class={css({ display: "flex", flexWrap: "wrap", gap: "2.5", mt: "3" })}>
          <Button
            disabled={checking() !== undefined}
            onClick={() => {
              resumeFiles?.click();
            }}
            size="sm"
          >
            Choose files
          </Button>
          <Show when={hasNestedPaths()}>
            <Button
              disabled={checking() !== undefined}
              onClick={() => {
                resumeFolder?.click();
              }}
              size="sm"
              variant="outline"
            >
              Choose folder
            </Button>
          </Show>
        </div>
        <Show when={checking()}>
          {(progress) => (
            <p
              class={css({
                color: "mut",
                fontVariantNumeric: "tabular-nums",
                mt: "2.5",
                textStyle: "sm",
              })}
              role="status"
            >
              {progress().total === 0
                ? "Checking the file against the parts already uploaded…"
                : `Checking ${bytes(progress().checked)} of ${bytes(progress().total)} you already sent`}
            </p>
          )}
        </Show>
        <input
          class={css({ display: "none" })}
          multiple
          onChange={(event) => {
            void resumePicked(event.currentTarget);
          }}
          ref={(element) => {
            resumeFiles = element;
          }}
          type="file"
        />
        <Show when={hasNestedPaths()}>
          <input
            class={css({ display: "none" })}
            onChange={(event) => {
              void resumePicked(event.currentTarget);
            }}
            ref={(element) => {
              resumeFolder = element;
            }}
            type="file"
            webkitdirectory=""
          />
        </Show>
        <Show when={resumeProblems().length > 0}>
          <ul
            class={css({ color: "rust", listStyle: "none", mt: "3", textStyle: "sm" })}
            role="alert"
          >
            <For each={resumeProblems()}>{(message) => <li>{message}</li>}</For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}

import type { ManagedRuntime } from "effect/ManagedRuntime";
import { createSignal, For, Show } from "solid-js";
import { css, cx } from "styled-system/css";

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
    <section class={css({ maxW: "[860px]", px: { base: "6", sm: "12" }, py: "10" })}>
      <h1
        class={css({
          fontSize: "[40px]",
          fontWeight: "semibold",
          letterSpacing: "[-0.035em]",
          lineHeight: "tight",
        })}
      >
        Send something big.
      </h1>

      <div class={css({ mt: "8", pos: "relative" })}>
        <p
          class={css({
            color: "blue/80",
            fontFamily: "hand",
            fontSize: "2xl",
            fontWeight: "semibold",
            lineHeight: "tight",
            pos: "absolute",
            right: "4",
            rotate: "[-4deg]",
            top: "-10",
            userSelect: "none",
            zIndex: 10,
          })}
        >
          <span class={css({ display: { base: "none", sm: "inline" } })}>
            the whole folder is fine, we keep its structure
          </span>
          <span
            class={css({
              display: { base: "inline", sm: "none" },
              fontSize: "lg",
              whiteSpace: "nowrap",
            })}
          >
            folders keep their structure
          </span>
        </p>
        <div
          class={cx(
            css({
              _motionReduce: { transitionProperty: "[none]" },
              borderRadius: "3xl",
              borderStyle: "dashed",
              borderWidth: "[2px]",
              display: "grid",
              minH: "[320px]",
              placeItems: "center",
              textAlign: "center",
              transitionDuration: "[300ms]",
              transitionProperty: "[border-color,scale]",
              transitionTimingFunction: "smooth",
            }),
            dragging()
              ? css({
                  "--dots-ink": "rgb(39 64 196 / .35)",
                  borderColor: "blue",
                  borderStyle: "solid",
                  scale: "[1.01]",
                })
              : css({ borderColor: "ink/25" }),
          )}
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
          <div
            class={css({
              alignItems: "center",
              display: "flex",
              flexDir: "column",
              gap: "3",
              pointerEvents: "none",
              px: "6",
            })}
          >
            <span
              class={css({
                bg: "ink",
                borderRadius: "2xl",
                boxSize: "12",
                color: "paper",
                display: "grid",
                placeItems: "center",
              })}
            >
              <PhUploadSimpleBold class={css({ boxSize: "6" })} />
            </span>
            <p class={css({ fontSize: "[17px]", fontWeight: "semibold" })}>
              Drop a folder or files
            </p>
            <p class={css({ color: "mut", fontSize: "sm" })}>
              or{" "}
              <button
                class={css({
                  color: "ink",
                  pointerEvents: "auto",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                })}
                onClick={() => filesInput?.click()}
                type="button"
              >
                choose files
              </button>{" "}
              ·{" "}
              <button
                class={css({
                  color: "ink",
                  pointerEvents: "auto",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                })}
                onClick={() => folderInput?.click()}
                type="button"
              >
                choose a folder
              </button>
            </p>
          </div>
        </div>
        <input
          class={css({ display: "none" })}
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
          class={css({ display: "none" })}
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

      <div
        class={css({
          alignItems: "center",
          columnGap: "6",
          display: "flex",
          flexWrap: "wrap",
          mt: "6",
          rowGap: "3",
        })}
      >
        <fieldset class={css({ alignItems: "center", display: "flex", gap: "2" })}>
          <legend class={css({ srOnly: true })}>Keep files for</legend>
          <span class={css({ fontSize: "sm", fontWeight: "medium" })}>Keep files for</span>
          <For each={retentionChoices}>
            {(days) => (
              <label
                class={cx(
                  css({
                    borderRadius: "full",
                    cursor: "pointer",
                    fontFamily: "mono",
                    fontSize: "sm",
                    px: "3",
                    py: "1",
                    transitionProperty: "colors",
                  }),
                  retention() === days
                    ? css({
                        bg: "ink",
                        color: "paper",
                        shadow: "[0 0 0 1px var(--colors-ink)]",
                      })
                    : css({
                        _hover: { bg: "panel" },
                        color: "ink",
                        shadow: "[0 0 0 1px var(--colors-line)]",
                      }),
                )}
              >
                <input
                  checked={retention() === days}
                  class={css({ srOnly: true })}
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
        <span
          class={css({
            color: "mut",
            fontFamily: "mono",
            fontSize: "xs",
            marginLeft: "auto",
          })}
        >
          counted from when the upload finishes
        </span>
      </div>

      <Show when={sending()}>
        <p class={css({ color: "mut", fontSize: "sm", mt: "4" })}>Setting the delivery up…</p>
      </Show>
      <Show when={problems().length > 0}>
        <div class={css({ mt: "4" })} role="alert">
          <For each={problems()}>
            {(problem) => <p class={css({ color: "rust", fontSize: "sm" })}>{problem}</p>}
          </For>
        </div>
      </Show>
    </section>
  );
}

import { RetentionDays } from "@tranzfer/contracts";
import { For, Show } from "solid-js";
import { css, cx } from "styled-system/css";

import PhFolderSimpleBold from "~icons/ph/folder-simple-bold";
import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";

import { inkStrokes } from "../landing/notebook";
import { Button } from "../ui/Button";

const ghost = css({
  bg: "panel",
  borderRadius: "card",
  inset: "0",
  pos: "absolute",
  shadow: "paperGhost",
});

/**
 * The send surface: a stack of paper with one big drop target. Dropping
 * works anywhere on the page (the page owns that listener); this card
 * lights up while files hover and offers real buttons for keyboards.
 */
export function SendCard(props: {
  dragging: boolean;
  pickFiles: () => void;
  pickFolder: () => void;
  problems: readonly string[];
  retention: RetentionDays;
  sending: boolean;
  setRetention: (days: RetentionDays) => void;
}) {
  return (
    <section
      aria-labelledby="send-title"
      class={cx("group", css({ pos: "relative", pt: { base: "0", lg: "10" } }))}
    >
      <p
        aria-hidden="true"
        class={css({
          color: "blue",
          display: { base: "none", sm: "block" },
          fontFamily: "hand",
          fontSize: "22",
          fontWeight: "semibold",
          lineHeight: "compact",
          opacity: 0.8,
          pointerEvents: "none",
          pos: "absolute",
          right: "2",
          rotate: "[-4deg]",
          top: { base: "-9", lg: "-1" },
          zIndex: 3,
        })}
      >
        whole folders are fine,
        <br />
        we keep the structure
      </p>
      <svg
        aria-hidden="true"
        class={cx(
          "in",
          inkStrokes,
          css({
            color: "blue",
            display: { base: "none", lg: "block" },
            h: "[70px]",
            opacity: 0.7,
            overflow: "visible",
            pointerEvents: "none",
            pos: "absolute",
            right: "[196px]",
            top: "4",
            w: "[90px]",
            zIndex: 3,
          }),
        )}
        viewBox="0 0 90 70"
      >
        <path d="M86 10 C 60 4, 30 12, 18 40 C 14 50, 13 56, 14 64" style="--len:140" />
        <path d="M6 54 L 14 66 L 24 56" style="--len:40" />
      </svg>

      <div class={css({ pos: "relative" })}>
        <div
          class={cx(
            ghost,
            css({
              lg: { transform: "[rotate(-5deg) translate(-14px,14px)]" },
              transform: "[rotate(-3deg) translate(-6px,8px)]",
            }),
          )}
        />
        <div
          class={cx(
            ghost,
            css({
              lg: { transform: "[rotate(3.5deg) translate(12px,8px)]" },
              transform: "[rotate(2deg) translate(6px,6px)]",
            }),
          )}
        />
        <div
          class={cx(
            css({
              _groupHover: { rotate: "[0deg]" },
              _motionReduce: { rotate: "[0deg]", transitionProperty: "[box-shadow]" },
              bg: "panel",
              borderRadius: "card",
              p: { base: "4", sm: "5.5" },
              pos: "relative",
              rotate: { base: "[-0.6deg]", lg: "[-1.5deg]" },
              shadow: "paper",
              transitionDuration: "slowest",
              transitionProperty: "[rotate,box-shadow]",
              transitionTimingFunction: "smooth",
            }),
            props.dragging && css({ rotate: "[0deg]" }),
          )}
        >
          <header
            class={css({
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: "3",
              justifyContent: "space-between",
              mb: "4",
            })}
          >
            <h2 class={css({ fontWeight: "semibold" })} id="send-title">
              New delivery
            </h2>
            <fieldset
              class={css({
                alignItems: "center",
                bg: "ink/6",
                borderRadius: "full",
                display: "flex",
                gap: "0.5",
                p: "0.75",
              })}
            >
              <legend class={css({ srOnly: true })}>Keep files for</legend>
              <For each={RetentionDays.literals}>
                {(days) => (
                  <label
                    class={cx(
                      css({
                        "&:has(:focus-visible)": {
                          outline: "[2px solid var(--colors-blue)]",
                          outlineOffset: "[1px]",
                        },
                        borderRadius: "full",
                        cursor: "pointer",
                        fontFamily: "mono",
                        fontSize: "13",
                        minW: "10",
                        px: "2.5",
                        py: "1",
                        textAlign: "center",
                        transitionDuration: "fast",
                        transitionProperty: "[background-color,color,box-shadow]",
                      }),
                      props.retention === days
                        ? css({ bg: "white", color: "ink", shadow: "paperRow" })
                        : css({ _hover: { color: "ink" }, color: "mut" }),
                    )}
                  >
                    <input
                      checked={props.retention === days}
                      class={css({ srOnly: true })}
                      name="retention"
                      onChange={() => {
                        props.setRetention(days);
                      }}
                      type="radio"
                      value={String(days)}
                    />
                    {days}d
                  </label>
                )}
              </For>
            </fieldset>
          </header>

          <div
            class={cx(
              "paper-dots",
              css({
                _motionReduce: { transitionProperty: "[border-color]" },
                alignItems: "center",
                borderRadius: "[14px]",
                borderStyle: "dashed",
                borderWidth: "[1.5px]",
                cursor: "pointer",
                display: "flex",
                flexDir: "column",
                gap: "3",
                justifyContent: "center",
                minH: { base: "0", lg: "72" },
                px: "5",
                py: { base: "6", lg: "8" },
                textAlign: "center",
                transitionDuration: "normal",
                transitionProperty: "[border-color,background-color]",
                transitionTimingFunction: "smooth",
              }),
              props.dragging
                ? css({ "--dots-ink": "rgb(39 64 196 / .4)", bg: "blue/5", borderColor: "blue" })
                : css({ borderColor: "[#b9b2a2]" }),
            )}
            // Pointer convenience only: the buttons below are the keyboard path.
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                props.pickFiles();
              }
            }}
          >
            <span
              aria-hidden="true"
              class={css({
                bg: "ink",
                borderRadius: "2xl",
                boxSize: "14",
                color: "white",
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
                shadow: "[0 16px 30px -14px rgba(0,0,0,.6)]",
              })}
            >
              <PhUploadSimpleBold class={css({ boxSize: "6" })} />
            </span>
            <p class={css({ fontSize: "17", fontWeight: "semibold", pointerEvents: "none" })}>
              <Show when={!props.dragging} fallback="Let go to send">
                <span class={css({ "@media (pointer: coarse)": { display: "none" } })}>
                  Drop files or a folder
                </span>
                <span
                  class={css({
                    "@media (pointer: coarse)": { display: "inline" },
                    display: "none",
                  })}
                >
                  Pick files or a whole folder
                </span>
              </Show>
            </p>
            <p
              class={css({
                "@media (pointer: coarse)": { display: "none" },
                color: "mut",
                pointerEvents: "none",
                textStyle: "sm",
              })}
            >
              Anywhere on this page works.
            </p>
            <div
              class={css({
                display: "flex",
                flexWrap: "wrap",
                gap: "2.5",
                justifyContent: "center",
                mt: "2",
              })}
            >
              <Button
                disabled={props.sending}
                onClick={() => {
                  props.pickFiles();
                }}
                size="sm"
              >
                <PhUploadSimpleBold />
                Choose files
              </Button>
              <Button
                disabled={props.sending}
                onClick={() => {
                  props.pickFolder();
                }}
                size="sm"
                variant="outline"
              >
                <PhFolderSimpleBold />
                Choose a folder
              </Button>
            </div>
          </div>

          <footer
            class={css({
              borderColor: "line",
              borderTopWidth: "1px",
              color: "mut",
              fontFamily: "mono",
              fontSize: "13",
              mt: "4",
              pt: "3.5",
            })}
          >
            <p aria-live="polite">
              <Show
                when={props.sending}
                fallback={`link lives ${props.retention} ${props.retention === 1 ? "day" : "days"} after the upload finishes`}
              >
                setting the delivery up…
              </Show>
            </p>
          </footer>
          <Show when={props.problems.length > 0}>
            <div class={css({ mt: "3" })} role="alert">
              <For each={props.problems}>
                {(problem) => <p class={css({ color: "rust", textStyle: "sm" })}>{problem}</p>}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}

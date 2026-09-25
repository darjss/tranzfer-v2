import type { Delivery, Principal } from "@tranzfer/contracts";
import { createMemo, For, Show } from "solid-js";
import { css, cx } from "styled-system/css";

import PhPlusBold from "~icons/ph/plus-bold";
import PhSignOutBold from "~icons/ph/sign-out-bold";

import { authClient } from "../api/auth-client";
import Brand from "../landing/Brand";
import { Button } from "../ui/Button";
import { transfers } from "../uploads/store";
import { bytes, rollup, statusOf, toneText, totalSize } from "./format";
import { Avatar, Progress } from "./parts";

interface Props {
  readonly deliveries: readonly Delivery[];
  readonly online: boolean;
  readonly principal: Principal;
  readonly selectedId: string | undefined;
  readonly select: (id?: string) => void;
}

const signOut = async () => {
  await authClient.signOut();
  window.location.assign("/");
};

export function Sidebar(props: Props) {
  const groups = createMemo(() => {
    const inProgress = props.deliveries.filter((d) => d.status === "open");
    const ready = props.deliveries.filter((d) => d.status === "ready");
    const ended = props.deliveries.filter(
      (d) => d.status === "expired" || d.status === "cancelled",
    );
    return [
      ["In progress", inProgress],
      ["Ready", ready],
      ["Ended", ended],
    ] as const;
  });

  return (
    <aside
      class={css({
        borderColor: "line",
        lg: {
          bg: "panel/85",
          borderRightWidth: "1px",
          display: "flex",
          flexDir: "column",
          h: "screen",
          pos: "sticky",
          top: "0",
        },
        lgDown: { display: "contents" },
      })}
    >
      <div
        class={css({
          alignItems: "center",
          display: "flex",
          h: "16",
          lgDown: { bg: "panel" },
          px: "5",
        })}
      >
        <Brand />
      </div>
      <div
        class={css({
          borderBottomWidth: "1px",
          borderColor: "line",
          lg: { borderBottomWidth: "0", pb: "0" },
          lgDown: { bg: "panel" },
          pb: "4",
          px: "4",
        })}
      >
        <Button
          class={css({ w: "full" })}
          onClick={() => {
            props.select();
          }}
          size="sm"
        >
          <PhPlusBold /> New delivery
        </Button>
      </div>
      <nav
        class={css({
          flex: "1",
          lgDown: { order: "2" },
          mt: "3",
          overflowY: "auto",
          pb: "4",
          px: "2",
        })}
      >
        <For each={groups()}>
          {([label, itemsInGroup]) => (
            <>
              <p
                class={css({
                  color: "mut",
                  display: "flex",
                  fontSize: "xs",
                  fontWeight: "semibold",
                  gap: "2",
                  pb: "1.5",
                  pt: "5",
                  px: "3",
                })}
              >
                {label}{" "}
                <span class={css({ fontFamily: "mono", fontWeight: "normal" })}>
                  {itemsInGroup.length}
                </span>
              </p>
              <For each={itemsInGroup}>
                {(delivery) => {
                  const roll = createMemo(() => rollup(delivery, (id) => transfers[id]));
                  const status = createMemo(() => statusOf(delivery, roll(), props.online));
                  const total = createMemo(() => totalSize(delivery));
                  return (
                    <button
                      class={cx(
                        css({
                          borderRadius: "xl",
                          display: "grid",
                          gap: "1.5",
                          px: "3",
                          py: "2.5",
                          textAlign: "left",
                          transitionDuration: "[150ms]",
                          transitionProperty: "colors",
                          w: "full",
                        }),
                        props.selectedId === delivery.id
                          ? css({
                              bg: "paper",
                              shadow: "[0 0 0 1px var(--colors-line)]",
                            })
                          : css({ _hover: { bg: "paper/60" } }),
                      )}
                      aria-current={props.selectedId === delivery.id ? "true" : undefined}
                      onClick={() => {
                        props.select(delivery.id);
                      }}
                      type="button"
                    >
                      <span
                        class={css({
                          alignItems: "baseline",
                          display: "flex",
                          gap: "3",
                          justifyContent: "space-between",
                        })}
                      >
                        <b
                          class={css({
                            fontSize: "[15px]",
                            fontWeight: "semibold",
                            truncate: true,
                          })}
                        >
                          {delivery.title}
                        </b>
                        <small class={css({ color: "mut", fontFamily: "mono", fontSize: "xs" })}>
                          {bytes(total())}
                        </small>
                      </span>
                      <Show when={delivery.status === "open" && roll().local}>
                        <Progress
                          flightPct={total() === 0 ? 0 : (roll().inFlight / total()) * 100}
                          pct={total() === 0 ? 0 : (roll().confirmed / total()) * 100}
                          tone={status().tone}
                        />
                      </Show>
                      <small class={cx(css({ fontSize: "xs" }), toneText[status().tone])}>
                        {status().short}
                      </small>
                    </button>
                  );
                }}
              </For>
            </>
          )}
        </For>
      </nav>
      <footer
        class={css({
          alignItems: "center",
          borderColor: "line",
          borderTopWidth: "1px",
          display: "flex",
          fontSize: "sm",
          gap: "3",
          lgDown: { order: "3" },
          px: "4",
          py: "3",
        })}
      >
        <Avatar name={props.principal.name} />
        <span class={css({ fontWeight: "medium", truncate: true })}>{props.principal.name}</span>
        <button
          class={css({
            _hover: { color: "ink" },
            color: "mut",
            marginLeft: "auto",
            transitionProperty: "colors",
          })}
          aria-label="Sign out"
          onClick={() => {
            void signOut();
          }}
          type="button"
        >
          <PhSignOutBold class={css({ boxSize: "4" })} />
        </button>
      </footer>
    </aside>
  );
}

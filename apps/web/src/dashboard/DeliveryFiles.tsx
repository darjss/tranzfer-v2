import type { Delivery } from "@tranzfer/contracts";
import * as Predicate from "effect/Predicate";
import { createMemo, For, Match, Show, Switch, useContext } from "solid-js";
import { css, cx } from "styled-system/css";

import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { Button } from "../ui/Button";
import { transfers } from "../uploads/store";
import { Uploads } from "../uploads/uploads";
import { bytes, files, kindWords, transferStatus } from "./format";
import type { Kind } from "./format";
import { KindIcon, kindText, Progress, sheetBlock, sheetHeading } from "./parts";

const fileKind = {
  Active: "moving",
  Cancelled: "cancelled",
  Complete: "ready",
  Elsewhere: "elsewhere",
  Failed: "failed",
  Interrupted: "interrupted",
  NeedsFile: "needsFile",
} satisfies Record<ReturnType<typeof transferStatus>["_tag"], Kind>;

/** The delivery's files, each with its own progress, failure and retry. */
export function DeliveryFiles(props: { transfers: Delivery["transfers"] }) {
  const runtime = useContext(RuntimeContext);
  return (
    <section class={sheetBlock}>
      <h3 class={sheetHeading}>
        Files{" "}
        <span class={css({ color: "mut", fontFamily: "mono", fontWeight: "normal" })}>
          {files(props.transfers.length)}
        </span>
      </h3>
      <ul class={css({ display: "grid", listStyle: "none", mt: "2" })}>
        <For each={props.transfers}>
          {(transfer) => {
            const status = createMemo(() => transferStatus(transfer, transfers[transfer.id]));
            const kind = () => fileKind[status()._tag];
            return (
              <li
                class={css({
                  alignItems: "center",
                  borderBottomWidth: "1px",
                  borderColor: "line/70",
                  columnGap: "3",
                  display: "grid",
                  gridTemplateColumns: "[auto minmax(0,1fr) auto]",
                  py: "2.5",
                })}
              >
                <KindIcon class={css({ boxSize: "6" })} kind={kind()} />
                <div class={css({ minW: "0" })}>
                  <p
                    class={css({ fontFamily: "mono", fontSize: "13", truncate: true })}
                    title={transfer.path}
                  >
                    {transfer.path}
                  </p>
                  <Switch>
                    <Match
                      when={
                        Predicate.isTagged(status(), "Active") ? transfers[transfer.id] : undefined
                      }
                    >
                      {(progress) => (
                        <Progress
                          class={css({ mt: "1.5" })}
                          confirmed={progress().confirmed}
                          inFlight={progress().inFlight}
                          kind="moving"
                          label={`${transfer.path} upload`}
                          total={transfer.size}
                        />
                      )}
                    </Match>
                    <Match
                      when={
                        Predicate.isTagged(status(), "Failed") ? transfers[transfer.id] : undefined
                      }
                    >
                      {(progress) => (
                        <p class={css({ color: "rust", fontSize: "13", mt: "0.5" })}>
                          {appError(progress().error).message}
                        </p>
                      )}
                    </Match>
                    <Match
                      when={
                        Predicate.isTagged(status(), "NeedsFile")
                          ? transfers[transfer.id]
                          : undefined
                      }
                    >
                      {(progress) => (
                        <Show
                          when={progress().error !== undefined}
                          fallback={
                            <p class={cx(css({ fontSize: "13", mt: "0.5" }), kindText(kind()))}>
                              {kindWords[kind()].label}
                            </p>
                          }
                        >
                          <p class={css({ color: "rust", fontSize: "13", mt: "0.5" })}>
                            {appError(progress().error).message}
                          </p>
                        </Show>
                      )}
                    </Match>
                    <Match when={!Predicate.isTagged(status(), "Complete")}>
                      <p class={cx(css({ fontSize: "13", mt: "0.5" }), kindText(kind()))}>
                        {kindWords[kind()].label}
                      </p>
                    </Match>
                  </Switch>
                </div>
                <div class={css({ alignItems: "center", display: "flex", gap: "3" })}>
                  <Show when={Predicate.isTagged(status(), "Failed")}>
                    <Button
                      onClick={() => {
                        runtime.runFork(Uploads.use((uploads) => uploads.retry(transfer.id)));
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Retry
                    </Button>
                  </Show>
                  <span
                    class={css({
                      color: "mut",
                      fontFamily: "mono",
                      fontSize: "13",
                      fontVariantNumeric: "tabular-nums",
                    })}
                  >
                    {bytes(transfer.size)}
                  </span>
                </div>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}

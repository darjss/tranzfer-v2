import { Meta, Title } from "@solidjs/meta";
import { EmailAddress } from "@tranzfer/contracts";
import type { RequestUpload } from "@tranzfer/contracts";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import {
  createSignal,
  Errored,
  For,
  Loading,
  Match,
  onSettled,
  Show,
  Switch,
  useContext,
} from "solid-js";
import { css, cx } from "styled-system/css";

import PhClockBold from "~icons/ph/clock-bold";
import PhFolderSimpleBold from "~icons/ph/folder-simple-bold";
import PhLinkBreakBold from "~icons/ph/link-break-bold";
import PhUploadSimpleBold from "~icons/ph/upload-simple-bold";

import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { liveDelivery } from "../dashboard/deliveries";
import { bytes, etaAt, files, fromNow, kindWords, speedAt, untilDate } from "../dashboard/format";
import type { Kind } from "../dashboard/format";
import { KindIcon, kindText, Progress } from "../dashboard/parts";
import { Button } from "../ui/Button";
import Loader, { linkQuips } from "../ui/Loader";
import { Paper, paperFrom, paperTitle, StateIcon } from "../ui/Paper";
import { online, transfers, wireWindow } from "../uploads/store";
import { chosenFiles, getDroppedFiles, Uploads } from "../uploads/uploads";
import { createPortal } from "./portal";

const field = css({
  _focusVisible: {
    outlineColor: "blue",
    outlineOffset: "0.5",
    outlineStyle: "solid",
    outlineWidth: "2px",
  },
  bg: "white",
  borderRadius: "xl",
  fontSize: "[16px]",
  minW: "0",
  px: "3",
  py: "2",
  shadow: "[inset 0 0 0 1px var(--colors-line)]",
  w: "full",
});

const label = css({ display: "grid", fontWeight: "medium", gap: "1", textStyle: "sm" });
const hint = css({ color: "mut", fontWeight: "normal", textStyle: "xs" });
const iconSize = css({ boxSize: "5" });

// The uploader's words. Most states read the same as for the owner; the
// ones that talk about links, cancelling or sharing do not apply to them.
const words: Record<Kind, { readonly label: string; readonly detail: string }> = {
  ...kindWords,
  cancelled: { detail: "The person you're sending to cancelled this upload.", label: "Cancelled" },
  expired: { detail: "This upload has expired and its files are deleted.", label: "Expired" },
  interrupted: {
    detail:
      "This browser has no record of this upload, so it can't continue it. Send the files again.",
    label: "Interrupted",
  },
  ready: { detail: "Delivered. You can close this page.", label: "Sent" },
};

const resumeProblem = (
  problem: "changed" | "gone" | "policy" | "unreadable" | "unknown",
  name: string,
) => {
  if (problem === "unknown") {
    return `"${name}" isn't one of the files this upload is waiting for.`;
  }
  if (problem === "changed") {
    return `"${name}" has changed since you started, so we won't continue with it.`;
  }
  if (problem === "unreadable") {
    return `"${name}" couldn't be read. Pick it again.`;
  }
  if (problem === "gone") {
    return `"${name}" can't continue because its partial upload is gone from storage. Send it again as a new upload.`;
  }
  return `"${name}" was started by an older version of Tranzfer and can't continue. Send it again.`;
};

function UploadRow(props: { token: string; upload: RequestUpload }) {
  const runtime = useContext(RuntimeContext);
  const live = liveDelivery({
    get delivery() {
      return props.upload;
    },
    get online() {
      return online();
    },
  });
  const [problems, setProblems] = createSignal<readonly string[]>([]);
  const [checking, setChecking] = createSignal<{ checked: number; total: number }>();
  let pickFiles: HTMLInputElement | undefined;
  let pickFolder: HTMLInputElement | undefined;

  const retryFailed = () => {
    for (const transfer of props.upload.transfers) {
      if (transfers[transfer.id]?.phase === "failed") {
        runtime.runFork(Uploads.use((engine) => engine.retry(transfer.id)));
      }
    }
  };

  const resumePicked = async (input: HTMLInputElement) => {
    const picked = [...(input.files ?? [])];
    input.value = "";
    if (picked.length === 0) {
      return;
    }
    const { token, upload } = props;
    // Checking a reselected file hashes every stored part, which can take
    // minutes for a big one, so the row says why it waits.
    setChecking({ checked: 0, total: 0 });
    const exit = await runtime.runPromiseExit(
      Uploads.use((engine) =>
        engine.resume(
          upload,
          picked,
          (progress) => {
            setChecking(progress);
          },
          token,
        ),
      ),
    );
    setChecking(undefined);
    setProblems(
      Exit.isSuccess(exit)
        ? exit.value.map(({ name, problem }) => resumeProblem(problem, name))
        : [appError(exit.cause).message],
    );
  };

  return (
    <li
      class={css({
        alignItems: "center",
        bg: "paper",
        borderRadius: "2xl",
        columnGap: "3.5",
        display: "grid",
        gridTemplateColumns: "[auto minmax(0,1fr) auto]",
        px: "4",
        py: "3.5",
      })}
    >
      <KindIcon kind={live.kind()} />
      <div class={css({ minW: "0" })}>
        <p class={css({ fontSize: "15", fontWeight: "semibold", truncate: true })}>
          {files(props.upload.transfers.length)} · {bytes(live.total())}
        </p>
        <p
          class={cx(
            kindText(live.kind()),
            css({
              fontFamily: "mono",
              fontSize: "13",
              fontVariantNumeric: "tabular-nums",
              mt: "0.5",
            }),
          )}
        >
          <Switch fallback={words[live.kind()].label}>
            <Match when={live.kind() === "moving"}>
              {speedAt(live.roll().speed)} ·{" "}
              {etaAt(live.total() - live.roll().confirmed, live.roll().speed)} left
            </Match>
            <Match when={live.kind() === "needsFile"}>
              {bytes(live.roll().confirmed)} of {bytes(live.total())} arrived
            </Match>
          </Switch>
        </p>
        <Show when={words[live.kind()].detail !== "" && live.kind() !== "ready"}>
          <p class={css({ color: "mut", mt: "1", textStyle: "sm" })}>{words[live.kind()].detail}</p>
        </Show>
        <Show
          when={
            live.kind() === "moving" || live.kind() === "starting" || live.kind() === "needsFile"
          }
        >
          <Progress
            class={css({ mt: "2.5" })}
            confirmed={live.roll().confirmed}
            inFlight={live.roll().inFlight}
            kind={live.kind()}
            label="Upload progress"
            total={live.total()}
          />
        </Show>
        <Show when={checking()}>
          {(progress) => (
            <p class={css({ color: "mut", mt: "2", textStyle: "sm" })} role="status">
              Checking the files against what already arrived: {bytes(progress().checked)} of{" "}
              {bytes(progress().total)}
            </p>
          )}
        </Show>
        <Show when={problems().length > 0}>
          <ul
            class={css({ color: "rust", listStyle: "none", mt: "2", textStyle: "sm" })}
            role="alert"
          >
            <For each={problems()}>{(message) => <li>{message}</li>}</For>
          </ul>
        </Show>
      </div>
      <div class={css({ alignItems: "center", display: "flex", gap: "2" })}>
        <Switch>
          <Match when={live.kind() === "failed"}>
            <Button onClick={retryFailed} size="sm">
              Retry
            </Button>
          </Match>
          <Match when={live.kind() === "needsFile"}>
            <Button
              disabled={checking() !== undefined}
              onClick={() => {
                pickFiles?.click();
              }}
              size="sm"
            >
              Pick the files
            </Button>
            <Show when={props.upload.transfers.some((transfer) => transfer.path.includes("/"))}>
              <Button
                disabled={checking() !== undefined}
                onClick={() => {
                  pickFolder?.click();
                }}
                size="sm"
                variant="outline"
              >
                Pick the folder
              </Button>
            </Show>
          </Match>
          <Match when={live.kind() === "moving"}>
            <span
              class={css({
                fontFamily: "mono",
                fontSize: "15",
                fontVariantNumeric: "tabular-nums",
                minW: "[4ch]",
                textAlign: "right",
              })}
            >
              {live.total() === 0 ? 0 : Math.floor((live.roll().confirmed / live.total()) * 100)}%
            </span>
          </Match>
        </Switch>
      </div>
      <Show when={live.kind() === "needsFile"}>
        <input
          class={css({ display: "none" })}
          multiple
          onChange={(event) => {
            void resumePicked(event.currentTarget);
          }}
          ref={(element) => {
            pickFiles = element;
          }}
          type="file"
        />
        <input
          class={css({ display: "none" })}
          onChange={(event) => {
            void resumePicked(event.currentTarget);
          }}
          ref={(element) => {
            pickFolder = element;
          }}
          type="file"
          webkitdirectory=""
        />
      </Show>
    </li>
  );
}

function Request(props: { token: string }) {
  const runtime = useContext(RuntimeContext);
  const portal = createPortal(runtime, () => props.token);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const [dragging, setDragging] = createSignal(false);
  let filesInput: HTMLInputElement | undefined;
  let folderInput: HTMLInputElement | undefined;

  onSettled(() => {
    wireWindow();
  });

  const ready = () => name().trim() !== "" && !portal.sending();

  const pick = async (picked: Iterable<File>) => {
    const chosen = chosenFiles(picked);
    if (chosen.length === 0 || !ready()) {
      return;
    }
    const address = email().trim();
    if (address !== "" && !Schema.is(EmailAddress)(address)) {
      setProblem("That email address doesn't look right. Fix it or leave it empty.");
      return;
    }
    setProblem(undefined);
    const failure = await portal.send(chosen, {
      email: address === "" ? null : address,
      name: name().trim(),
    });
    if (failure !== undefined) {
      setProblem(`${failure} Nothing was uploaded.`);
    }
  };

  const drop = async (dropped: DataTransfer) => {
    await pick(await getDroppedFiles(dropped));
  };

  return (
    <>
      <Title>{portal.request().title} · Tranzfer</Title>
      <p class={paperFrom}>{portal.request().ownerName} asked for files</p>
      <h1 class={cx(paperTitle, css({ mt: "1.5" }))}>{portal.request().title}</h1>
      <p
        class={css({
          alignItems: "center",
          color: "mut",
          display: "flex",
          fontFamily: "mono",
          fontSize: "13",
          gap: "1.5",
          mt: "3",
        })}
      >
        <PhClockBold class={css({ boxSize: "3.5" })} />
        open until {untilDate(portal.request().expiresAt)}, {fromNow(portal.request().expiresAt)}
      </p>
      {/* The owner's own text. Solid sets it as a text node, so markup in it
          shows as typed. */}
      <Show when={portal.request().instructions}>
        {(instructions) => (
          <p
            class={css({
              bg: "paper",
              borderRadius: "xl",
              mt: "5",
              overflowWrap: "anywhere",
              px: "4",
              py: "3",
              whiteSpace: "pre-wrap",
            })}
          >
            {instructions()}
          </p>
        )}
      </Show>

      <Show when={!online()}>
        <p
          class={css({
            bg: "amber/10",
            borderRadius: "xl",
            color: "[#8a4f00]",
            fontWeight: "medium",
            mt: "5",
            px: "4",
            py: "2.5",
            textStyle: "sm",
          })}
          role="status"
        >
          Connection lost. We'll continue when you're back online.
        </p>
      </Show>

      <div class={css({ display: "grid", gap: "3.5", mt: "6" })}>
        <label class={label}>
          Your name
          <input
            autocomplete="name"
            class={field}
            maxlength={60}
            name="name"
            onInput={(event) => {
              setName(event.currentTarget.value);
            }}
            required
            value={name()}
          />
        </label>
        <label class={label}>
          <span>
            Your email{" "}
            <span class={hint}>optional, so {portal.request().ownerName} can reach you</span>
          </span>
          <input
            autocomplete="email"
            class={field}
            maxlength={254}
            name="email"
            onInput={(event) => {
              setEmail(event.currentTarget.value);
            }}
            type="email"
            value={email()}
          />
        </label>
      </div>

      <div
        class={cx(
          "paper-dots",
          css({
            alignItems: "center",
            borderRadius: "[14px]",
            borderStyle: "dashed",
            borderWidth: "[1.5px]",
            display: "flex",
            flexDir: "column",
            gap: "3",
            justifyContent: "center",
            mt: "5",
            px: "5",
            py: "7",
            textAlign: "center",
            transitionDuration: "normal",
            transitionProperty: "[border-color,background-color]",
          }),
          dragging()
            ? css({ "--dots-ink": "rgb(39 64 196 / .4)", bg: "blue/5", borderColor: "blue" })
            : css({ borderColor: "[#b9b2a2]" }),
        )}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer !== null) {
            void drop(event.dataTransfer);
          }
        }}
      >
        <p class={css({ fontSize: "17", fontWeight: "semibold" })}>
          {dragging() ? "Let go to send" : "Drop files or a folder here"}
        </p>
        <div
          class={css({ display: "flex", flexWrap: "wrap", gap: "2.5", justifyContent: "center" })}
        >
          <Button
            disabled={!ready()}
            onClick={() => {
              filesInput?.click();
            }}
            size="sm"
          >
            <PhUploadSimpleBold />
            Choose files
          </Button>
          <Button
            disabled={!ready()}
            onClick={() => {
              folderInput?.click();
            }}
            size="sm"
            variant="outline"
          >
            <PhFolderSimpleBold />
            Choose a folder
          </Button>
        </div>
        <p class={css({ color: "mut", textStyle: "sm" })} aria-live="polite">
          <Show
            when={name().trim() !== ""}
            fallback="Type your name first, so they know who sent it."
          >
            <Show
              when={portal.sending()}
              fallback="Only the person who sent this link gets your files."
            >
              Setting the upload up…
            </Show>
          </Show>
        </p>
      </div>
      <Show when={problem()}>
        {(message) => (
          <p class={css({ color: "rust", mt: "3", textStyle: "sm" })} role="alert">
            {message()}
          </p>
        )}
      </Show>

      <Show when={portal.uploads.length > 0}>
        <h2 class={css({ fontSize: "17", fontWeight: "semibold", mt: "8" })}>Your uploads</h2>
        <ul class={css({ display: "grid", gap: "2.5", listStyle: "none", mt: "3" })}>
          <For each={portal.uploads}>
            {(upload) => <UploadRow token={props.token} upload={upload} />}
          </For>
        </ul>
        <p class={css({ color: "mut", mt: "4", textStyle: "sm" })}>
          Keep this page open while files upload. If it closes, open the link again and pick the
          same files. Only what's missing goes up.
        </p>
      </Show>

      <input
        class={css({ display: "none" })}
        multiple
        onChange={(event) => {
          const input = event.currentTarget;
          void pick([...(input.files ?? [])]);
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
          void pick([...(input.files ?? [])]);
          input.value = "";
        }}
        ref={(element) => {
          folderInput = element;
        }}
        type="file"
        webkitdirectory=""
      />
    </>
  );
}

const RequestError = (props: { error: unknown }) => {
  const error = () => appError(props.error);
  return (
    <>
      <StateIcon tone="rust">
        <PhLinkBreakBold class={iconSize} />
      </StateIcon>
      <h1 class={paperTitle}>This link doesn't work.</h1>
      <p class={css({ color: "mut", mt: "3" })}>
        {error().tag === "RequestNotFound"
          ? "It may have expired or been closed, or the address is incomplete. Ask the person who sent it for a new one."
          : error().message}
      </p>
    </>
  );
};

/** What an uploader with no account sees at /r/<token>. */
export function Portal(props: { token: string }) {
  // A dead link fails the request read inside Request, which lands here.
  return (
    <Paper>
      <Meta name="robots" content="noindex" />
      <Loading fallback={<Loader quips={linkQuips} />}>
        <Errored fallback={(error) => <RequestError error={error()} />}>
          <Request token={props.token} />
        </Errored>
      </Loading>
    </Paper>
  );
}

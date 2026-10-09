import { Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { clientOnly, getRequestEvent, isServer } from "@solidjs/web";
import { LinkExpired, LinkLocked, LinkNotReady } from "@tranzfer/contracts";
import type { SharedDelivery } from "@tranzfer/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { createMemo, createSignal, Errored, For, Loading, Show, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { css, cx } from "styled-system/css";

import PhClockBold from "~icons/ph/clock-bold";
import PhDownloadSimpleBold from "~icons/ph/download-simple-bold";
import PhFileBold from "~icons/ph/file-bold";
import PhHourglassMediumBold from "~icons/ph/hourglass-medium-bold";
import PhLinkBreakBold from "~icons/ph/link-break-bold";

import { ApiClient } from "../../api/client";
import { appError } from "../../api/errors";
import { runEffect, RuntimeContext } from "../../api/solid-effect";
import { bytes, files, fromNow, untilDate } from "../../dashboard/format";
import { Previews } from "../../downloads/Previews";
import { SaveAll } from "../../downloads/SaveAll";
import { Unlock } from "../../downloads/Unlock";
import Brand from "../../landing/Brand";
import Loader, { linkQuips } from "../../ui/Loader";

const ghost = css({
  bg: "panel",
  borderRadius: "card",
  inset: "0",
  pos: "absolute",
  shadow: "paperGhost",
});

const title = css({
  fontSize: { base: "26", sm: "40" },
  fontWeight: "semibold",
  letterSpacing: "title",
  lineHeight: "compact",
  overflowWrap: "anywhere",
  textWrap: "balance",
});

const from = css({ color: "mut", fontFamily: "mono", fontSize: "13" });

/** A stack of paper, the landing's card language, holding one delivery. */
const Paper = (props: { children: JSX.Element }) => (
  <div class={css({ marginInline: "auto", maxW: "[680px]", pos: "relative" })}>
    <div class={cx(ghost, css({ transform: "[rotate(-2.5deg) translate(-10px,12px)]" }))} />
    <div class={cx(ghost, css({ transform: "[rotate(2deg) translate(10px,8px)]" }))} />
    <div
      class={css({
        bg: "panel",
        borderRadius: "card",
        p: { base: "5", sm: "8" },
        pos: "relative",
        rotate: { base: "[0deg]", sm: "[-0.6deg]" },
        shadow: "paper",
      })}
    >
      {props.children}
    </div>
  </div>
);

const StateIcon = (props: { children: JSX.Element; tone: "blue" | "mut" | "rust" }) => (
  <span
    aria-hidden="true"
    class={cx(
      css({ borderRadius: "full", boxSize: "11", display: "grid", mb: "5", placeItems: "center" }),
      props.tone === "blue" && css({ bg: "blue/10", color: "blue" }),
      props.tone === "mut" && css({ bg: "ink/6", color: "mut" }),
      props.tone === "rust" && css({ bg: "rust/10", color: "rust" }),
    )}
  >
    {props.children}
  </span>
);

const iconSize = css({ boxSize: "5" });

// The three ways a link can fail each get their own page; anything else
// reads through the shared error words.
const LinkError = (props: { error: unknown }) => {
  const error = () => appError(props.error);
  return (
    <Paper>
      <Show
        when={Schema.is(LinkNotReady)(props.error) ? props.error : undefined}
        fallback={
          <Show
            when={Schema.is(LinkExpired)(props.error) ? props.error : undefined}
            fallback={
              <>
                <StateIcon tone="rust">
                  <PhLinkBreakBold class={iconSize} />
                </StateIcon>
                <h1 class={title}>This link doesn't work.</h1>
                <p class={css({ color: "mut", mt: "3" })}>
                  {error().tag === "LinkNotFound"
                    ? "It may have been cancelled, or the address is incomplete. Ask the sender for a fresh link."
                    : error().message}
                </p>
              </>
            }
          >
            {(expired) => (
              <>
                <StateIcon tone="mut">
                  <PhClockBold class={iconSize} />
                </StateIcon>
                <Title>{expired().title} · Tranzfer</Title>
                <h1 class={title}>{expired().title}</h1>
                <p class={css({ color: "mut", mt: "3" })}>
                  This link expired on {untilDate(expired().expiredAt)} and its files are deleted.
                  Ask the sender to send it again.
                </p>
              </>
            )}
          </Show>
        }
      >
        {(notReady) => (
          <>
            <StateIcon tone="blue">
              <PhHourglassMediumBold class={iconSize} />
            </StateIcon>
            <Title>{notReady().title} · Tranzfer</Title>
            <p class={from}>from {notReady().senderName}</p>
            <h1 class={cx(title, css({ mt: "1.5" }))}>{notReady().title}</h1>
            <p class={css({ color: "ink/80", mt: "3" })}>
              Still uploading. This link starts working once every file is finished, so check back
              in a little while.
            </p>
          </>
        )}
      </Show>
    </Paper>
  );
};

const Delivery = (props: {
  delivery: SharedDelivery;
  download: (path: string) => void;
  token: string;
  unlock: string | undefined;
}) => {
  const total = () => props.delivery.files.reduce((sum, file) => sum + file.size, 0);
  return (
    <Paper>
      <Title>{props.delivery.title} · Tranzfer</Title>
      <p class={from}>from {props.delivery.senderName}</p>
      <h1 class={cx(title, css({ mt: "1.5" }))}>{props.delivery.title}</h1>
      <p
        class={css({
          display: "flex",
          flexWrap: "wrap",
          fontFamily: "mono",
          fontSize: "13",
          fontVariantNumeric: "tabular-nums",
          gap: "[4px 14px]",
          mt: "3",
        })}
      >
        <span>
          {files(props.delivery.files.length)} · {bytes(total())}
        </span>
        <Show when={props.delivery.expiresAt}>
          {(expiresAt) => (
            <span
              class={css({
                alignItems: "center",
                color: "mut",
                display: "inline-flex",
                gap: "1.5",
              })}
            >
              <PhClockBold class={css({ boxSize: "3.5" })} />
              available until {untilDate(expiresAt())}, {fromNow(expiresAt())}
            </span>
          )}
        </Show>
      </p>
      {/* The note is the sender's own text. Solid sets it as a text node, so
          markup in it shows as typed. */}
      <Show when={props.delivery.note}>
        {(note) => (
          <div class={css({ mt: "5" })}>
            <p
              class={css({
                color: "blue",
                fontFamily: "hand",
                fontSize: "22",
                fontWeight: "semibold",
                lineHeight: "compact",
              })}
            >
              {props.delivery.senderName} says
            </p>
            <p
              class={css({
                bg: "paper",
                borderRadius: "xl",
                mt: "1",
                overflowWrap: "anywhere",
                px: "4",
                py: "3",
                whiteSpace: "pre-wrap",
              })}
            >
              {note()}
            </p>
          </div>
        )}
      </Show>
      <Show when={props.delivery.files.length > 1}>
        <SaveAll delivery={props.delivery} token={props.token} unlock={props.unlock} />
      </Show>
      <Previews files={props.delivery.files} />

      <ul class={css({ borderColor: "line", borderTopWidth: "1px", listStyle: "none", mt: "6" })}>
        <For each={props.delivery.files}>
          {(file) => (
            <li
              class={css({
                alignItems: "center",
                borderBottomWidth: "1px",
                borderColor: "line/70",
                columnGap: "3",
                display: "grid",
                gridTemplateColumns: "[auto minmax(0,1fr) auto auto]",
                py: "3",
              })}
            >
              <PhFileBold aria-hidden="true" class={css({ boxSize: "4", color: "mut" })} />
              <span
                class={css({ fontFamily: "mono", fontSize: "13", truncate: true })}
                title={file.path}
              >
                {file.path}
              </span>
              <span
                class={css({
                  color: "mut",
                  display: { base: "none", sm: "block" },
                  fontFamily: "mono",
                  fontSize: "13",
                  fontVariantNumeric: "tabular-nums",
                })}
              >
                {bytes(file.size)}
              </span>
              <a
                aria-label={`Download ${file.path}, ${bytes(file.size)}`}
                class={css({
                  _active: { scale: "[.96]" },
                  _hover: { bg: "[#23252b]" },
                  alignItems: "center",
                  bg: "ink",
                  borderRadius: "xl",
                  color: "paper",
                  display: "inline-flex",
                  fontWeight: "semibold",
                  gap: "2",
                  minH: "10",
                  px: "3.5",
                  textStyle: "sm",
                  transitionDuration: "fast",
                  transitionProperty: "[background-color,scale]",
                  transitionTimingFunction: "smooth",
                })}
                href={file.url}
                onClick={(event) => {
                  event.preventDefault();
                  props.download(file.path);
                }}
              >
                <PhDownloadSimpleBold class={css({ boxSize: "4" })} />
                <span class={css({ display: { base: "none", sm: "inline" } })}>Download</span>
              </a>
            </li>
          )}
        </For>
      </ul>
      <p class={css({ color: "mut", mt: "5", textStyle: "sm" })}>
        If a download stops, your browser's download manager can usually resume it while this link
        is live.
      </p>
    </Paper>
  );
};

const Opening = () => (
  <Paper>
    <Loader quips={linkQuips} />
  </Paper>
);

const LinkPage = () => {
  const params = useParams<{ token: string }>();
  const runtime = useContext(RuntimeContext);
  // What UnlockLink returned. It lives in this page only, so a reload asks
  // for the password again, and it stops working after a day.
  const [unlock, setUnlock] = createSignal<string>();
  const opened = createMemo(() => {
    // Read here so a new unlock re-opens the link; the effect runs untracked.
    const current = unlock();
    return runEffect(
      ApiClient.use((api) =>
        api.OpenLink({ token: params.token, unlock: current }).pipe(
          Effect.map((shared) => ({ locked: undefined, shared })),
          Effect.catchTag("LinkLocked", (locked) => Effect.succeed({ locked, shared: undefined })),
        ),
      ),
    );
  });

  // Rendered URLs expire, so a click re-opens the link for a fresh one and
  // surfaces a dead link the same way the load-time boundary does.
  const [linkError, setLinkError] = createSignal<unknown>();
  const download = async (path: string) => {
    const current = unlock();
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.OpenLink({ token: params.token, unlock: current })),
    );
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause);
      if (Schema.is(LinkLocked)(error)) {
        // The unlock ran out; clearing it opens the password form again.
        setUnlock(undefined);
      } else {
        setLinkError(error);
      }
      return;
    }
    const file = exit.value.files.find((candidate) => candidate.path === path);
    if (file !== undefined) {
      // Only the click is known; the browser's download manager takes it from here.
      runtime.runFork(
        ApiClient.use((api) =>
          api.ReportDownload({ event: "started", path, token: params.token, unlock: current }),
        ).pipe(Effect.ignore),
      );
      location.assign(file.url);
    }
  };

  return (
    <Loading fallback={<Opening />}>
      <Errored fallback={(error) => <LinkError error={error()} />}>
        <Show
          when={linkError()}
          fallback={
            <Show
              when={opened().shared}
              fallback={
                <Show when={opened().locked}>
                  {(locked) => (
                    <Paper>
                      <Unlock
                        onUnlock={(next) => {
                          setUnlock(next);
                        }}
                        senderName={locked().senderName}
                        token={params.token}
                      />
                    </Paper>
                  )}
                </Show>
              }
            >
              {(shared) => (
                <Delivery
                  delivery={shared()}
                  download={(path) => {
                    void download(path);
                  }}
                  token={params.token}
                  unlock={unlock()}
                />
              )}
            </Show>
          }
        >
          {(error) => <LinkError error={error()} />}
        </Show>
      </Errored>
    </Loading>
  );
};

// Client-only for now. With SSR the page renders and hydrates, but Solid
// re-runs the OpenLink read on the client during hydration (a second fetch
// that re-signs every URL), and that request never settles, which leaves
// the RPC client stuck so Download hangs. The server renders the shell.
const LazyLink = clientOnly(async () => await Promise.resolve({ default: LinkPage }));

export default function PublicDelivery() {
  // Signed URLs reach the page, so it must never be cached.
  if (isServer) {
    getRequestEvent()?.response.headers.set("cache-control", "no-store");
  }
  return (
    <div
      class={css({
        marginInline: "auto",
        maxW: "page",
        minH: "screen",
        pb: "24",
        px: { base: "5", sm: "7" },
      })}
    >
      <Meta name="description" content="Download files shared with you through Tranzfer." />
      <Meta name="robots" content="noindex" />
      <nav
        class={css({
          alignItems: "center",
          borderBottomWidth: "1px",
          borderColor: "ink",
          display: "flex",
          h: "16",
        })}
      >
        <Brand />
      </nav>
      <main class={css({ pt: { base: "10", sm: "16" } })}>
        <LazyLink fallback={<Opening />} />
      </main>
    </div>
  );
}

import { EmailAddress, maxRecipients } from "@tranzfer/contracts";
import type { Delivery, DeliveryId } from "@tranzfer/contracts";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { css, cx } from "styled-system/css";

import PhArrowSquareOutBold from "~icons/ph/arrow-square-out-bold";
import PhXBold from "~icons/ph/x-bold";

import { Button, button } from "../ui/Button";
import type { Finished } from "./deliveries";
import { bytes, emailSummary, emailWords, files, totalSize, untilDate } from "./format";
import type { Emailed } from "./format";
import { CopyLink, field, fieldLabel, LinkPassword } from "./parts";
import "./dashboard.css";

type SetPassword = (deliveryId: DeliveryId, password: string | null) => Promise<string | undefined>;

type Update = (
  deliveryId: DeliveryId,
  details: { readonly note: string; readonly title: string },
) => Promise<string | undefined>;

type Email = (deliveryId: DeliveryId, recipients: readonly string[]) => Promise<string | undefined>;

const parseAddress = Schema.decodeUnknownOption(EmailAddress);

/** "42 s", "4 min 12 s", "1 h 5 min": how long a send took, as a person says it. */
export const tookAt = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ${seconds - minutes * 60} s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes - hours * 60} min`;
};

/** Copies a ready-to-paste message with the link and the last day it works. */
function CopyMessage(props: { text: string }) {
  const [state, setState] = createSignal<"idle" | "copied" | "failed">("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearTimeout(timer);
  });
  const copy = async () => {
    const copied = await navigator.clipboard
      .writeText(props.text)
      .then(() => true)
      .catch(() => false);
    setState(copied ? "copied" : "failed");
    clearTimeout(timer);
    timer = setTimeout(() => {
      setState("idle");
    }, 1800);
  };
  return (
    <>
      <Button
        onClick={() => {
          void copy();
        }}
        size="sm"
        variant="outline"
      >
        {state() === "copied" ? "Message copied" : "Copy message"}
      </Button>
      <span class={css({ srOnly: true })} role="status">
        {state() === "copied" ? "Message copied" : ""}
      </span>
      <Show when={state() === "failed"}>
        <span class={css({ color: "rust", textStyle: "xs" })} role="alert">
          Couldn't copy the message.
        </span>
      </Show>
    </>
  );
}

function EditDetails(props: { delivery: Delivery; update: Update }) {
  const [editing, setEditing] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [note, setNote] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const open = () => {
    setTitle(props.delivery.title);
    setNote(props.delivery.note);
    setProblem(undefined);
    setEditing(true);
  };
  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    const failure = await props.update(props.delivery.id, {
      note: note().trim(),
      title: title().trim(),
    });
    if (failure === undefined) {
      setEditing(false);
    } else {
      setProblem(failure);
    }
  };
  return (
    <Show
      when={editing()}
      fallback={
        <Button css={{ alignSelf: "start" }} onClick={open} size="xs" variant="outline">
          {props.delivery.note === "" ? "Rename or add a note" : "Edit title and note"}
        </Button>
      }
    >
      <form
        class={css({ display: "grid", gap: "3", maxW: "[460px]" })}
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label class={fieldLabel}>
          Title
          <input
            class={field}
            maxlength={200}
            name="title"
            onInput={(event) => {
              setTitle(event.currentTarget.value);
            }}
            required
            value={title()}
          />
        </label>
        <label class={fieldLabel}>
          Note for the recipient, optional
          <textarea
            class={field}
            maxlength={500}
            name="note"
            onInput={(event) => {
              setNote(event.currentTarget.value);
            }}
            rows={3}
            value={note()}
          />
        </label>
        <Show when={problem()}>
          {(message) => (
            <p class={css({ color: "rust", textStyle: "sm" })} role="alert">
              {message()}
            </p>
          )}
        </Show>
        <div class={css({ display: "flex", gap: "2" })}>
          <Button disabled={title().trim() === ""} size="xs" type="submit">
            Save
          </Button>
          <Button
            onClick={() => {
              setEditing(false);
            }}
            size="xs"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </form>
    </Show>
  );
}

/** Emails the link to up to ten people and lists how each send ended. */
function EmailIt(props: {
  delivery: Delivery;
  email: Email;
  emailing: boolean;
  sent: readonly Emailed[];
}) {
  const [open, setOpen] = createSignal(false);
  const [text, setText] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const typed = Arr.dedupe(
      text()
        .split(/[\s,;]+/u)
        .filter((address) => address !== "")
        .map((address) => address.toLowerCase()),
    );
    const bad = typed.find((address) => Option.isNone(parseAddress(address)));
    if (typed.length === 0) {
      setProblem("Type at least one email address.");
    } else if (typed.length > maxRecipients) {
      setProblem(`That's ${typed.length} addresses. Send to up to ${maxRecipients} at a time.`);
    } else if (bad === undefined) {
      const failure = await props.email(props.delivery.id, typed);
      if (failure === undefined) {
        setText("");
        setProblem(undefined);
        setOpen(false);
      } else {
        setProblem(failure);
      }
    } else {
      setProblem(`"${bad}" doesn't look like an email address.`);
    }
  };
  return (
    <div class={css({ display: "grid", gap: "3" })}>
      <Show when={open()}>
        <form
          class={css({ display: "grid", gap: "3", maxW: "[460px]" })}
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label class={fieldLabel}>
            Email addresses, up to {maxRecipients}. Separate them with commas or new lines.
            <textarea
              class={field}
              name="recipients"
              onInput={(event) => {
                setText(event.currentTarget.value);
              }}
              rows={3}
              value={text()}
            />
          </label>
          <p class={css({ color: "mut", textStyle: "xs" })}>
            Each person gets their own email with this link, from Tranzfer. Replies go to your
            account's address.
          </p>
          <Show when={problem()}>
            {(message) => (
              <p class={css({ color: "rust", textStyle: "sm" })} role="alert">
                {message()}
              </p>
            )}
          </Show>
          <div class={css({ display: "flex", gap: "2" })}>
            <Button disabled={props.emailing} size="xs" type="submit">
              {props.emailing ? "Sending" : "Send email"}
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setProblem(undefined);
              }}
              size="xs"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Show>
      <Show when={!open()}>
        <Button
          css={{ alignSelf: "start" }}
          onClick={() => {
            setOpen(true);
          }}
          size="xs"
          variant="outline"
        >
          {props.sent.length === 0 ? "Email it" : "Email it to more people"}
        </Button>
      </Show>
      <Show when={props.sent.length > 0}>
        <div aria-live="polite" class={css({ display: "grid", gap: "1.5", textStyle: "sm" })}>
          <p class={css({ fontWeight: "semibold" })}>
            {props.sent.some((row) => row.status === "queued")
              ? "Sending"
              : emailSummary(props.sent)}
          </p>
          <ul class={css({ display: "grid", gap: "1" })}>
            <For each={props.sent}>
              {(row) => (
                <li
                  class={css({
                    color: row.status === "failed" ? "rust" : "mut",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "[2px 12px]",
                  })}
                >
                  <span class={css({ color: "ink", overflowWrap: "anywhere" })}>{row.to}</span>
                  <span>{emailWords(row)}</span>
                </li>
              )}
            </For>
          </ul>
          <p class={css({ color: "mut", textStyle: "xs" })}>
            Sent means the mail server took it. We can't see anyone's inbox.
          </p>
        </div>
      </Show>
    </div>
  );
}

/**
 * The finished-send moment: a delivery this page just sent has every file
 * uploaded and finalized. It plays one short reveal on mount and sits above
 * the board until dismissed, then the delivery is only its Ready row.
 */
export function SendDone(props: {
  delivery: Delivery;
  dismiss: () => void;
  email: Email;
  emailing: boolean;
  sent: readonly Emailed[];
  setPassword: SetPassword;
  tookMs: number;
  update: Update;
}) {
  const url = () => `${location.origin}${props.delivery.link}`;
  const message = () => {
    const { expiresAt, title } = props.delivery;
    return expiresAt === null
      ? `${title} is ready: ${url()}`
      : `${title} is ready: ${url()} Download before ${untilDate(expiresAt)}.`;
  };
  return (
    <section
      aria-labelledby={`done-${props.delivery.id}`}
      class={cx(
        "done-in",
        css({
          bg: "panel",
          borderRadius: "card",
          display: "grid",
          gap: "4",
          p: { base: "5", sm: "6" },
          pos: "relative",
          shadow: "paper",
        }),
      )}
    >
      <div class={css({ alignItems: "center", display: "flex", gap: "3" })}>
        <span
          aria-hidden="true"
          class={css({
            bg: "ok/12",
            borderRadius: "full",
            boxSize: "9",
            color: "ok",
            display: "grid",
            flexShrink: 0,
            placeItems: "center",
          })}
        >
          <svg class="done-check" fill="none" height="20" viewBox="0 0 24 24" width="20">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.6"
            />
          </svg>
        </span>
        <h2
          class={css({ fontSize: "17", fontWeight: "semibold", letterSpacing: "snug" })}
          id={`done-${props.delivery.id}`}
        >
          Your files are ready
        </h2>
        <button
          aria-label="Dismiss"
          class={css({
            _hover: { bg: "ink/6" },
            borderRadius: "full",
            boxSize: "9",
            display: "grid",
            ml: "auto",
            placeItems: "center",
          })}
          onClick={() => {
            props.dismiss();
          }}
          type="button"
        >
          <PhXBold class={css({ boxSize: "4" })} />
        </button>
      </div>

      <div class={css({ minW: "0" })}>
        <p
          class={css({
            fontSize: "22",
            fontWeight: "semibold",
            letterSpacing: "snug",
            lineHeight: "compact",
            overflowWrap: "anywhere",
          })}
        >
          {props.delivery.title}
        </p>
        <p
          class={css({
            color: "mut",
            display: "flex",
            flexWrap: "wrap",
            fontFamily: "mono",
            fontSize: "13",
            fontVariantNumeric: "tabular-nums",
            gap: "[2px 12px]",
            mt: "1.5",
          })}
        >
          <span>
            {files(props.delivery.transfers.length)} · {bytes(totalSize(props.delivery))}
          </span>
          <span>took {tookAt(props.tookMs)}</span>
          <Show when={props.delivery.expiresAt}>
            {(expiresAt) => <span>link works until {untilDate(expiresAt())}</span>}
          </Show>
        </p>
        <Show when={props.delivery.note}>
          {(note) => (
            <p
              class={css({
                bg: "paper",
                borderRadius: "xl",
                mt: "3",
                overflowWrap: "anywhere",
                px: "3.5",
                py: "2.5",
                textStyle: "sm",
                whiteSpace: "pre-wrap",
              })}
            >
              {note()}
            </p>
          )}
        </Show>
      </div>

      <div class={css({ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "2.5" })}>
        <CopyLink link={props.delivery.link} variant="fill" />
        <CopyMessage text={message()} />
        <a
          class={button({ size: "sm", variant: "outline" })}
          href={props.delivery.link}
          rel="noopener"
          target="_blank"
        >
          Open recipient page
          <PhArrowSquareOutBold />
        </a>
      </div>

      <EmailIt
        delivery={props.delivery}
        email={props.email}
        emailing={props.emailing}
        sent={props.sent}
      />
      <div class={css({ alignItems: "start", display: "flex", flexWrap: "wrap", gap: "2.5" })}>
        <EditDetails delivery={props.delivery} update={props.update} />
        <LinkPassword delivery={props.delivery} setPassword={props.setPassword} />
      </div>
    </section>
  );
}

/** One card per delivery this page finished sending, newest first. */
export function SendDoneList(props: {
  deliveries: readonly Delivery[];
  dismiss: (deliveryId: DeliveryId) => void;
  email: Email;
  emailed: Record<string, Emailed[]>;
  emailing: boolean;
  finished: readonly Finished[];
  setPassword: SetPassword;
  update: Update;
}) {
  return (
    <Show when={props.finished.length > 0}>
      <div class={css({ display: "grid", gap: "4", mb: "10" })}>
        <For each={props.finished}>
          {(done) => (
            <Show
              when={props.deliveries.find(
                (delivery) => delivery.id === done.id && delivery.status === "ready",
              )}
            >
              {(delivery) => (
                <SendDone
                  delivery={delivery()}
                  dismiss={() => {
                    props.dismiss(done.id);
                  }}
                  email={props.email}
                  emailing={props.emailing}
                  sent={props.emailed[done.id] ?? []}
                  setPassword={props.setPassword}
                  tookMs={done.tookMs}
                  update={props.update}
                />
              )}
            </Show>
          )}
        </For>
      </div>
    </Show>
  );
}

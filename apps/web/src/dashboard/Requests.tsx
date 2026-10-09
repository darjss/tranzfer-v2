import { defaultRetentionDays, plans, RetentionDays } from "@tranzfer/contracts";
import type { BillingSummary, FileRequest, NewFileRequest, RequestId } from "@tranzfer/contracts";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { css, cx } from "styled-system/css";

import PhTrayArrowDownBold from "~icons/ph/tray-arrow-down-bold";

import { Button } from "../ui/Button";
import { bytes, fromNow } from "./format";
import { CopyLink } from "./parts";
import { unlockedBy } from "./SendCard";

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

function NewRequest(props: {
  billing: BillingSummary;
  cancel: () => void;
  create: (input: NewFileRequest) => Promise<string | undefined>;
}) {
  const [title, setTitle] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [days, setDays] = createSignal<RetentionDays>(defaultRetentionDays);
  const [maxGb, setMaxGb] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();

  const submit = async () => {
    setBusy(true);
    setProblem(undefined);
    const gigabytes = Number(maxGb());
    const failure = await props.create({
      instructions: instructions(),
      maxBytes: gigabytes > 0 ? Math.round(gigabytes * 1e9) : null,
      retentionDays: days(),
      title: title(),
    });
    setBusy(false);
    if (failure === undefined) {
      props.cancel();
    } else {
      setProblem(failure);
    }
  };

  return (
    <form
      class={css({
        bg: "panel",
        borderRadius: "2xl",
        display: "grid",
        gap: "3.5",
        p: "4",
        shadow: "paperRow",
      })}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 class={css({ fontWeight: "semibold" })}>New request</h3>
      <label class={label}>
        What are you asking for?
        <input
          class={field}
          maxlength={120}
          name="title"
          onInput={(event) => {
            setTitle(event.currentTarget.value);
          }}
          placeholder="Day 3 footage"
          required
          value={title()}
        />
      </label>
      <label class={label}>
        <span>
          Instructions <span class={hint}>optional, shown to the uploader</span>
        </span>
        <textarea
          class={field}
          maxlength={1000}
          name="instructions"
          onInput={(event) => {
            setInstructions(event.currentTarget.value);
          }}
          rows={3}
          value={instructions()}
        />
      </label>
      <fieldset class={css({ display: "grid", gap: "1.5" })}>
        <legend class={cx(label, css({ mb: "1.5" }))}>Open for</legend>
        <div class={css({ display: "flex", flexWrap: "wrap", gap: "2" })}>
          <For each={RetentionDays.literals}>
            {(option) => (
              <label
                title={
                  option > props.billing.maxRetentionDays
                    ? `Needs ${plans[unlockedBy(option)].name} or higher`
                    : undefined
                }
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
                    px: "3",
                    py: "1",
                  }),
                  days() === option
                    ? css({ bg: "ink", color: "paper" })
                    : css({ _hover: { color: "ink" }, bg: "ink/6", color: "mut" }),
                  option > props.billing.maxRetentionDays &&
                    css({ _hover: { color: "mut" }, cursor: "not-allowed", opacity: 0.5 }),
                )}
              >
                <input
                  checked={days() === option}
                  class={css({ srOnly: true })}
                  disabled={option > props.billing.maxRetentionDays}
                  name="days"
                  onChange={() => {
                    setDays(option);
                  }}
                  type="radio"
                  value={String(option)}
                />
                {option} {option === 1 ? "day" : "days"}
              </label>
            )}
          </For>
        </div>
        <p class={hint}>
          Each upload is kept {days()} {days() === 1 ? "day" : "days"} after it finishes.
        </p>
      </fieldset>
      <label class={label}>
        <span>
          Size limit in GB <span class={hint}>optional, for everything this link receives</span>
        </span>
        <input
          class={cx(field, css({ maxW: "40" }))}
          inputmode="decimal"
          min="0"
          name="limit"
          onInput={(event) => {
            setMaxGb(event.currentTarget.value);
          }}
          step="any"
          type="number"
          value={maxGb()}
        />
      </label>
      <p class={hint}>
        Uploads count against your space: {bytes(props.billing.usedBytes)} of{" "}
        {bytes(props.billing.limitBytes)} in use on {plans[props.billing.plan].name}.
      </p>
      <Show when={problem()}>
        {(message) => (
          <p class={css({ color: "rust", textStyle: "sm" })} role="alert">
            {message()}
          </p>
        )}
      </Show>
      <div class={css({ display: "flex", gap: "2" })}>
        <Button disabled={busy()} size="sm" type="submit">
          {busy() ? "Creating…" : "Create link"}
        </Button>
        <Button onClick={props.cancel} size="sm" variant="outline">
          Cancel
        </Button>
      </div>
    </form>
  );
}

const expiry = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function Row(props: {
  close: (requestId: RequestId) => Promise<string | undefined>;
  request: FileRequest;
}) {
  const [confirming, setConfirming] = createSignal(false);
  const [problem, setProblem] = createSignal<string>();
  const close = async () => {
    setProblem(undefined);
    const failure = await props.close(props.request.id);
    if (failure === undefined) {
      setConfirming(false);
    } else {
      setProblem(failure);
    }
  };
  return (
    <li
      class={css({
        alignItems: "center",
        bg: "panel",
        borderRadius: "2xl",
        columnGap: "3.5",
        display: "grid",
        gridTemplateColumns: "[minmax(0,1fr) auto]",
        px: "4",
        py: "3.5",
        shadow: "paperRow",
      })}
    >
      <div class={css({ minW: "0" })}>
        <p class={css({ fontSize: "15", fontWeight: "semibold", truncate: true })}>
          {props.request.title}
        </p>
        <p
          class={css({
            "& > span": { whiteSpace: "nowrap" },
            color: "mut",
            display: "flex",
            flexWrap: "wrap",
            fontFamily: "mono",
            fontSize: "13",
            fontVariantNumeric: "tabular-nums",
            gap: "[0 8px]",
            mt: "0.5",
          })}
        >
          <Switch>
            <Match when={props.request.status === "open"}>
              <span>
                open until {expiry.format(props.request.expiresAt)},{" "}
                {fromNow(props.request.expiresAt)}
              </span>
            </Match>
            <Match when={props.request.status === "closed"}>
              <span>Closed. The link no longer works.</span>
            </Match>
            <Match when={props.request.status === "expired"}>
              <span>Expired. The link no longer works.</span>
            </Match>
          </Switch>
          <span>
            {props.request.uploads === 0
              ? "no uploads yet"
              : `${props.request.uploads} ${props.request.uploads === 1 ? "upload" : "uploads"}, ${bytes(props.request.receivedBytes)}`}
          </span>
          <Show when={props.request.maxBytes}>
            {(limit) => <span>limit {bytes(limit())}</span>}
          </Show>
        </p>
      </div>
      <Show when={props.request.status === "open"}>
        <div class={css({ alignItems: "center", display: "flex", gap: "2" })}>
          <CopyLink link={props.request.link} variant="fill" />
          <Button
            disabled={confirming()}
            onClick={() => {
              setConfirming(true);
            }}
            size="xs"
            variant="outline"
          >
            Close
          </Button>
        </div>
      </Show>
      <Show when={confirming() || problem() !== undefined}>
        <div
          class={css({
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: "2",
            gridColumn: "[1 / -1]",
            mt: "3",
          })}
        >
          <Show when={confirming()}>
            <span class={css({ fontWeight: "medium", textStyle: "sm", w: "full" })}>
              Close this request? Its link stops working. Uploads already in stay on your list.
            </span>
            <Button
              onClick={() => {
                void close();
              }}
              size="xs"
              variant="danger"
            >
              Yes, close it
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
              }}
              size="xs"
              variant="outline"
            >
              Keep it open
            </Button>
          </Show>
          <Show when={problem()}>
            {(message) => (
              <p class={css({ color: "rust", textStyle: "sm", w: "full" })} role="alert">
                {message()}
              </p>
            )}
          </Show>
        </div>
      </Show>
    </li>
  );
}

/**
 * Links the owner hands to people without an account, who then upload into
 * the owner's space. Their uploads land on the board like any delivery.
 */
export function Requests(props: {
  billing: BillingSummary;
  close: (requestId: RequestId) => Promise<string | undefined>;
  create: (input: NewFileRequest) => Promise<string | undefined>;
  requests: readonly FileRequest[];
}) {
  const [creating, setCreating] = createSignal(false);
  return (
    <section aria-labelledby="requests-title" class={css({ display: "grid", gap: "3", mb: "8" })}>
      <header
        class={css({
          alignItems: "center",
          display: "flex",
          gap: "3",
          justifyContent: "space-between",
        })}
      >
        <h2
          class={css({
            alignItems: "baseline",
            display: "flex",
            fontSize: "17",
            fontWeight: "semibold",
            gap: "2",
            letterSpacing: "snug",
          })}
          id="requests-title"
        >
          File requests
        </h2>
        <Show when={!creating()}>
          <Button
            onClick={() => {
              setCreating(true);
            }}
            size="xs"
            variant="outline"
          >
            <PhTrayArrowDownBold />
            Request files
          </Button>
        </Show>
      </header>
      <Show when={creating()}>
        <NewRequest
          billing={props.billing}
          cancel={() => {
            setCreating(false);
          }}
          create={props.create}
        />
      </Show>
      <Show
        when={props.requests.length > 0}
        fallback={
          <Show when={!creating()}>
            <p class={css({ color: "mut", textStyle: "sm" })}>
              Need files from someone? Make a link they can upload to, no account needed. What they
              send lands here like any delivery.
            </p>
          </Show>
        }
      >
        <ul class={css({ display: "grid", gap: "2.5", listStyle: "none" })}>
          <For each={props.requests}>
            {(request) => <Row close={props.close} request={request} />}
          </For>
        </ul>
      </Show>
    </section>
  );
}

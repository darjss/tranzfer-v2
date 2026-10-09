import * as Exit from "effect/Exit";
import { action, createOptimistic, createSignal, Show, useContext } from "solid-js";
import { css } from "styled-system/css";

import PhLockBold from "~icons/ph/lock-bold";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import { RuntimeContext } from "../api/solid-effect";
import { field, fieldLabel } from "../dashboard/parts";
import { Button } from "../ui/Button";

/** Asks for a link's password. A right one hands the page its unlock; a wrong one says so here. */
export const Unlock = (props: {
  onUnlock: (unlock: string) => void;
  senderName: string;
  token: string;
}) => {
  const runtime = useContext(RuntimeContext);
  const [password, setPassword] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const [checking, setChecking] = createOptimistic(false);

  const submit = action(async function* submit(attempt: string) {
    setChecking(true);
    setProblem(undefined);
    const { token } = props;
    const exit = await runtime.runPromiseExit(
      ApiClient.use((api) => api.UnlockLink({ password: attempt, token })),
    );
    yield;
    if (Exit.isSuccess(exit)) {
      setPassword("");
      props.onUnlock(exit.value.unlock);
    } else {
      setProblem(appError(exit.cause).message);
    }
  });

  return (
    <>
      <span
        aria-hidden="true"
        class={css({
          bg: "blue/10",
          borderRadius: "full",
          boxSize: "11",
          color: "blue",
          display: "grid",
          mb: "5",
          placeItems: "center",
        })}
      >
        <PhLockBold class={css({ boxSize: "5" })} />
      </span>
      <p class={css({ color: "mut", fontFamily: "mono", fontSize: "13" })}>
        from {props.senderName}
      </p>
      <h1
        class={css({
          fontSize: { base: "26", sm: "40" },
          fontWeight: "semibold",
          letterSpacing: "title",
          lineHeight: "compact",
          mt: "1.5",
          textWrap: "balance",
        })}
      >
        This delivery has a password.
      </h1>
      <p class={css({ color: "ink/80", mt: "3" })}>Ask the sender for it.</p>
      <form
        class={css({ display: "grid", gap: "3", maxW: "[360px]", mt: "6" })}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(password());
        }}
      >
        <label class={fieldLabel}>
          Password
          <input
            autocomplete="current-password"
            class={field}
            maxlength={128}
            name="password"
            onInput={(event) => {
              setPassword(event.currentTarget.value);
            }}
            required
            type="password"
            value={password()}
          />
        </label>
        <Show when={problem()}>
          {(message) => (
            <p class={css({ color: "rust", textStyle: "sm" })} role="alert">
              {message()}
            </p>
          )}
        </Show>
        <div>
          <Button disabled={checking() || password() === ""} size="sm" type="submit">
            {checking() ? "Checking…" : "Unlock"}
          </Button>
        </div>
      </form>
    </>
  );
};

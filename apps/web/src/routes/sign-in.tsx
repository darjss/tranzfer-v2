import { Meta, Title } from "@solidjs/meta";
import { createSignal, Match, Switch } from "solid-js";

import { authClient } from "../api/auth-client";
import { CardVariant, HeadlineVariant, SplitVariant } from "../auth/SignInPrototype";
import { PrototypeSwitcher, useVariant } from "../ui/PrototypeSwitcher";

const variants = [
  ["A", "Card"],
  ["B", "Split with photo"],
  ["C", "Headline, no card"],
] as const;

export default function SignIn() {
  const [pending, setPending] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const variant = useVariant(variants);
  const signInWithGoogle = async () => {
    if (pending()) {
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signIn.social({ callbackURL: "/me", provider: "google" });
      setFailed(result.error !== null);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  const onGoogle = () => {
    void signInWithGoogle();
  };
  return (
    <>
      <Title>Sign in · Tranzfer</Title>
      <Meta name="description" content="Sign in to Tranzfer with your Google account." />
      <Switch>
        <Match when={variant() === "A"}>
          <CardVariant pending={pending()} failed={failed()} onGoogle={onGoogle} />
        </Match>
        <Match when={variant() === "B"}>
          <SplitVariant pending={pending()} failed={failed()} onGoogle={onGoogle} />
        </Match>
        <Match when={variant() === "C"}>
          <HeadlineVariant pending={pending()} failed={failed()} onGoogle={onGoogle} />
        </Match>
      </Switch>
      <PrototypeSwitcher variants={variants} />
    </>
  );
}

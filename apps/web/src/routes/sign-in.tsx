import { Meta, Title } from "@solidjs/meta";
import { createSignal, Show } from "solid-js";

import { Button } from "../ui/Button";

import { authClient } from "../api/auth-client";

export default function SignIn() {
  const [pending, setPending] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
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
  return (
    <main class="flex min-h-screen items-center justify-center px-6">
      <Title>Sign in — Tranzfer</Title>
      <Meta name="description" content="Sign in to Tranzfer with your Google account." />
      <div class="w-full max-w-sm rounded-xl bg-panel p-8 text-center shadow-[inset_0_0_0_1px_var(--color-line),0_1px_2px_rgba(0,0,0,.06)]">
        <h1 class="text-2xl font-semibold text-ink">Sign in</h1>
        <p class="mt-2 text-sm text-mut">Use your Google account to sign in.</p>
        <Button
          class="mt-6 w-full"
          onClick={() => {
            void signInWithGoogle();
          }}
          disabled={pending()}
          aria-busy={pending() ? "true" : "false"}
          type="button"
        >
          {pending() ? "Connecting to Google…" : "Continue with Google"}
        </Button>
        <Show when={failed()}>
          <p class="mt-3 text-sm text-rust" role="alert">
            Google sign-in couldn't start. Try again.
          </p>
        </Show>
      </div>
    </main>
  );
}

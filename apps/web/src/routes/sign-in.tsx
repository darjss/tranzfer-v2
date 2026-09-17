import { Meta, Title } from "@solidjs/meta";

import { authClient } from "../api/auth-client";

const signInWithGoogle = () => {
  void authClient.signIn.social({ callbackURL: "/", provider: "google" });
};

export default function SignIn() {
  return (
    <main class="flex min-h-screen items-center justify-center px-6">
      <Title>Sign in — Tranzfer</Title>
      <Meta name="description" content="Sign in to Tranzfer with your Google account." />
      <div class="w-full max-w-sm rounded-xl bg-panel p-8 text-center shadow-[inset_0_0_0_1px_var(--color-line),0_1px_2px_rgba(0,0,0,.06)]">
        <h1 class="text-2xl font-semibold text-ink">Sign in</h1>
        <p class="mt-2 text-sm text-mut">Send the whole shoot. Never start over.</p>
        <button
          class="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-linear-to-b from-[#3352dc] to-blue px-6 py-[15px] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_1px_2px_rgba(23,24,28,.2),0_12px_28px_-12px_rgba(39,64,196,.7)] transition-[translate,scale,box-shadow,filter] duration-200 ease-smooth hover:-translate-y-px hover:brightness-[1.06] active:scale-[.97]"
          onClick={signInWithGoogle}
          type="button"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}

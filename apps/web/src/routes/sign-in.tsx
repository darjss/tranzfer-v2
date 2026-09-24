import { Meta, Title } from "@solidjs/meta";
import { createSignal, Show } from "solid-js";

import { authClient } from "../api/auth-client";
import Brand from "../landing/Brand";
import videoEdit from "../landing/assets/video-edit.webp";
import "../landing/landing.css";

const GoogleG = (props: { class?: string }) => (
  <svg class={props.class} viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const scopes = "We use your name, email and photo from Google. Nothing else.";

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
      const result = await authClient.signIn.social({
        callbackURL: "/deliveries",
        provider: "google",
      });
      setFailed(result.error !== null);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div class="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <Title>Sign in — Tranzfer</Title>
      <Meta name="description" content="Sign in to Tranzfer with your Google account." />
      <aside class="relative hidden overflow-hidden border-r border-line bg-[#efe9dd]/60 lg:block">
        <div class="absolute top-0 left-10 flex h-16 items-center">
          <Brand />
        </div>
        <figure class="note absolute top-[20%] left-[16%] w-[min(440px,62%)] -rotate-3 rounded-md bg-white p-2.5 pb-9 shadow-[0_40px_70px_-40px_rgba(23,24,28,.6),0_0_0_1px_rgba(0,0,0,.06)]">
          <span class="tape" />
          <img
            class="aspect-4/3 w-full rounded-[3px] object-cover saturate-[.9]"
            src={videoEdit}
            alt=""
          />
          <figcaption class="absolute bottom-3 left-3.5 font-mono text-[10px] tracking-[.08em] text-mut uppercase">
            ep14 · edit bay · 286 gb
          </figcaption>
        </figure>
        <p class="absolute top-[64%] left-[58%] w-[200px] -rotate-6 font-hand text-2xl leading-tight font-semibold text-blue/70">
          your editor is waiting on this one.
        </p>
        <div class="absolute right-12 bottom-24 left-12 grid gap-1 font-mono text-[13px] text-mut">
          <span class="flex justify-between border-b border-dashed border-line py-1.5">
            <b class="font-medium text-ink">EP14_A-Cam</b> 214 GB
          </span>
          <span class="flex justify-between border-b border-dashed border-line py-1.5">
            <b class="font-medium text-ink">EP14_B-Cam</b> 61 GB
          </span>
          <span class="flex justify-between py-1.5">
            <b class="font-medium text-ink">EP14_Audio</b> 11 GB
          </span>
        </div>
      </aside>
      <main class="flex flex-col px-8 py-7 sm:px-16">
        <div class="lg:invisible">
          <Brand />
        </div>
        <div class="my-auto max-w-[380px] py-16">
          <h1 class="text-[40px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
            Sign in to send <i class="text-blue">the big stuff.</i>
          </h1>
          <p class="mt-4 text-[17px] text-mut">One Google account. No password, no setup.</p>
          <button
            class="mt-8 inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-6 text-[15px] font-medium text-[#1f1f1f] ring-1 ring-[#747775] transition-[background-color,box-shadow,translate] duration-200 ease-smooth hover:bg-[#f7f8fa] hover:shadow-[0_1px_3px_rgba(60,64,67,.3)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue active:translate-y-px disabled:pointer-events-none disabled:opacity-60"
            onClick={() => {
              void signInWithGoogle();
            }}
            disabled={pending()}
            aria-busy={pending() ? "true" : "false"}
            type="button"
          >
            <GoogleG class="size-5 shrink-0" />
            {pending() ? "Opening Google…" : "Continue with Google"}
          </button>
          <Show when={failed()}>
            <p class="mt-3 text-sm text-rust" role="alert">
              Google sign-in didn't open. Try again.
            </p>
          </Show>
          <p class="mt-6 text-sm text-mut">{scopes}</p>
        </div>
        <a class="text-sm text-mut hover:text-ink" href="/">
          ← Back to tranzfer.app
        </a>
      </main>
    </div>
  );
}

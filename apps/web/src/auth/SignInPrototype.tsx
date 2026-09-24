// PROTOTYPE, throwaway. Three sign-in layouts on /sign-in?variant=A|B|C.
// The Google flow itself is real; only the layout differs.
import { Show } from "solid-js";

import Brand from "../landing/Brand";
import "../landing/landing.css";
import videoEdit from "../landing/assets/video-edit.webp";

interface Props {
  pending: boolean;
  failed: boolean;
  onGoogle: () => void;
}

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

// Google's light-theme button: white fill, #747775 outline, #1f1f1f label.
function GoogleButton(props: Props & { class?: string }) {
  return (
    <button
      class={[
        "inline-flex h-12 items-center justify-center gap-3 rounded-full bg-white px-6 text-[15px] font-medium text-[#1f1f1f] ring-1 ring-[#747775] transition-[background-color,box-shadow,translate] duration-200 ease-smooth hover:bg-[#f7f8fa] hover:shadow-[0_1px_3px_rgba(60,64,67,.3)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue active:translate-y-px disabled:pointer-events-none disabled:opacity-60",
        props.class,
      ]}
      onClick={() => {
        props.onGoogle();
      }}
      disabled={props.pending}
      aria-busy={props.pending ? "true" : "false"}
      type="button"
    >
      <GoogleG class="size-5 shrink-0" />
      {props.pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

const Failure = (props: { failed: boolean }) => (
  <Show when={props.failed}>
    <p class="mt-3 text-sm text-rust" role="alert">
      Google sign-in didn't open. Try again.
    </p>
  </Show>
);

const scopes = "We use your name, email and photo from Google. Nothing else.";

export function CardVariant(props: Props) {
  return (
    <div class="mx-auto flex min-h-screen max-w-[1180px] flex-col px-7">
      <nav class="flex h-16 items-center justify-between border-b border-ink">
        <Brand />
        <a class="text-[15px] text-mut hover:text-ink" href="/">
          Back to site
        </a>
      </nav>
      <main class="grid flex-1 place-items-center py-16">
        <div class="relative w-full max-w-[400px]">
          <div
            class="absolute inset-0 translate-x-[-10px] translate-y-3 -rotate-3 rounded-[20px] bg-panel ring-1 ring-line"
            aria-hidden="true"
          />
          <div class="relative rounded-[20px] bg-panel p-9 ring-1 ring-line shadow-[inset_0_1px_0_#fff,0_40px_80px_-50px_rgba(23,24,28,.5)]">
            <h1 class="text-[28px] leading-tight font-semibold tracking-[-0.03em]">
              Sign in to Tranzfer
            </h1>
            <p class="mt-2 text-[15px] text-mut">
              Use your Google account. There's no password to set up.
            </p>
            <GoogleButton {...props} class="mt-7 w-full" />
            <Failure failed={props.failed} />
            <p class="mt-7 border-t border-line pt-5 font-mono text-xs leading-relaxed text-mut">
              {scopes}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export function SplitVariant(props: Props) {
  return (
    <div class="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
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
          <GoogleButton {...props} class="mt-8 w-full" />
          <Failure failed={props.failed} />
          <p class="mt-6 text-sm text-mut">{scopes}</p>
        </div>
        <a class="text-sm text-mut hover:text-ink" href="/">
          ← Back to tranzfer.app
        </a>
      </main>
    </div>
  );
}

export function HeadlineVariant(props: Props) {
  return (
    <div class="mx-auto flex min-h-screen max-w-[1180px] flex-col px-7">
      <nav class="flex h-16 items-center justify-between border-b border-ink">
        <Brand />
        <a class="text-[15px] text-mut hover:text-ink" href="/">
          Back to site
        </a>
      </nav>
      <main class="relative flex flex-1 flex-col justify-center py-20">
        <h1 class="text-[clamp(48px,6vw,84px)] leading-[.95] font-semibold tracking-[-0.04em]">
          Big files,
          <br />
          <span class="relative inline-block text-blue italic">
            one sign-in.
            <svg
              class="absolute -bottom-2 left-0 h-4 w-full overflow-visible"
              viewBox="0 0 260 26"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                class="[animation:draw_.9s_var(--ease-smooth)_.3s_forwards] [stroke-dasharray:1] [stroke-dashoffset:1] motion-reduce:[animation:none] motion-reduce:[stroke-dashoffset:0]"
                pathLength="1"
                d="M4 18 C 60 6, 120 22, 178 10 S 240 12, 256 8"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              />
            </svg>
          </span>
        </h1>
        <p class="mt-8 max-w-[40ch] text-xl leading-snug font-medium text-[#3a3b40]">
          Tranzfer signs you in with Google. No password to invent, no email to confirm.
        </p>
        <div class="relative mt-10 flex flex-wrap items-center gap-6">
          <GoogleButton {...props} />
          <a
            class="border-b border-ink/25 pb-0.5 text-[15px] font-semibold text-ink hover:border-ink"
            href="/"
          >
            What is Tranzfer? →
          </a>
          <p class="absolute top-1/2 left-[412px] hidden -translate-y-1/2 -rotate-6 font-hand text-[22px] leading-tight font-semibold text-rust/60 lg:block">
            that's the whole form.
          </p>
        </div>
        <Failure failed={props.failed} />
        <dl class="mt-16 grid max-w-[520px] font-mono text-[13px]">
          <div class="flex justify-between border-t border-dashed border-line py-2.5">
            <dt class="text-mut">Password</dt>
            <dd>none</dd>
          </div>
          <div class="flex justify-between border-t border-dashed border-line py-2.5">
            <dt class="text-mut">From Google</dt>
            <dd>name, email, photo</dd>
          </div>
          <div class="flex justify-between border-y border-dashed border-line py-2.5">
            <dt class="text-mut">Works with</dt>
            <dd>any Google account</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}

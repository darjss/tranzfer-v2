import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schedule from "effect/Schedule";

// The 40-try cap counts failures, not elapsed time, so a sleep/wake clock
// jump cannot end it early; each backoff delay is capped at 30 seconds.
export const RETRY_CAP = Duration.seconds(30);
export const MAX_TRANSPORT_RETRIES = 40;

// Losing the network is a pause, not an error (law 7). Offline time waits on
// the `online` event and burns no attempts.
export const untilOnline: Effect.Effect<void> = Effect.suspend(() =>
  navigator.onLine
    ? Effect.void
    : Effect.callback((resume) => {
        const done = () => {
          resume(Effect.void);
        };
        window.addEventListener("online", done, { once: true });
        return Effect.sync(() => {
          window.removeEventListener("online", done);
        });
      }),
);

// Transport failures retry, and so does a signing rate limit, which clears
// within its window; other typed refusals (UploadClosed, InvalidUpload,
// Unauthorized) are the server's answer and stand.
export const retryTransport = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  untilOnline.pipe(Effect.andThen(effect)).pipe(
    Effect.retry({
      schedule: Schedule.exponential("1 second").pipe(
        Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, RETRY_CAP))),
      ),
      times: MAX_TRANSPORT_RETRIES,
      while: Predicate.or(Predicate.isTagged("RpcClientError"), Predicate.isTagged("RateLimited")),
    }),
  );

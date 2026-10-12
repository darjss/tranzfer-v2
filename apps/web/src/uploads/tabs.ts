import * as Effect from "effect/Effect";

// One Web Lock per transfer this tab is sending. Other tabs read the held
// locks to know a live tab owns it, and wait on the lock to hear it end. The
// browser frees it when the tab closes or crashes, so a dead owner never
// leaves a transfer stuck.
const PREFIX = "tranzfer:upload:";
const lockName = (transferId: string) => `${PREFIX}${transferId}`;

const release = new Map<string, (done: null) => void>();

export const claim = (transferId: string) => {
  if (release.has(transferId)) {
    return;
  }
  const held = Promise.withResolvers<null>();
  release.set(transferId, held.resolve);
  void navigator.locks.request(lockName(transferId), async () => {
    await held.promise;
  });
};

export const letGo = (transferId: string) => {
  release.get(transferId)?.(null);
  release.delete(transferId);
};

/** Ids of the transfers another live tab is sending. */
export const sendingElsewhere = () =>
  Effect.tryPromise(async () => {
    const snapshot = await navigator.locks.query();
    return new Set(
      (snapshot.held ?? [])
        .flatMap(({ name }) =>
          name?.startsWith(PREFIX) === true ? [name.slice(PREFIX.length)] : [],
        )
        .filter((transferId) => !release.has(transferId)),
    );
  }).pipe(
    // No Web Locks (an insecure context) reads as no other tab, the old behavior.
    Effect.catch(() => Effect.succeed(new Set<string>())),
  );

/** Resolves true once no tab holds the transfer, false if the wait was aborted. */
export const untilFree = async (transferId: string, signal: AbortSignal) =>
  // An abort rejects the request; that is the caller giving up, not a failure.
  await navigator.locks.request(lockName(transferId), { signal }, () => true).catch(() => false);

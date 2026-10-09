import type { SharedFile } from "@tranzfer/contracts";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

import { ApiClient } from "../api/client";
import { retryTransport, untilOnline } from "../uploads/uploads";

// The parts of the File System Access API a save touches. A picked folder
// satisfies them; so does the in-memory folder the tests use.
export interface Writable {
  readonly close: () => Promise<void>;
  readonly seek: (position: number) => Promise<void>;
  readonly write: (data: ArrayBufferView) => Promise<void>;
}
export interface SavedFile {
  readonly createWritable: (options: { keepExistingData: boolean }) => Promise<Writable>;
  readonly getFile: () => Promise<Blob>;
}
export interface Folder {
  readonly getDirectoryHandle: (name: string, options: { create: true }) => Promise<Folder>;
  readonly getFileHandle: (name: string, options: { create: true }) => Promise<SavedFile>;
  readonly name: string;
}

declare global {
  interface Window {
    // Chromium only. Safari and Firefox don't have it, hence optional.
    showDirectoryPicker?: (options: {
      id: string;
      mode: "readwrite";
      startIn: "downloads";
    }) => Promise<Folder>;
  }
}

/** A save stops on its own only after network retries run out, or when the disk refuses. */
export class SaveStopped extends Data.TaggedError("SaveStopped")<{
  readonly cause: unknown;
  readonly path: string;
  readonly reason: "disk" | "network";
}> {}

const disk = <A>(path: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new SaveStopped({ cause, path, reason: "disk" }),
    try: run,
  });

const network = <A>(path: string, run: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new SaveStopped({ cause, path, reason: "network" }),
    try: run,
  });

// Chromium writes into a swap file and replaces the real file only on
// close(), so a reload loses everything since the last close. Reopening with
// keepExistingData copies the saved part into a fresh swap file, so commits
// wait until the unsaved part is as big as the saved one: a reload loses at
// most half the file, and the copying adds up to less than one file size.
const CHECKPOINT = 256 * 1024 * 1024;
const PARALLEL_FILES = 3;
const RETRY_CAP = Duration.seconds(30);
const MAX_RETRIES = 40;

const basename = (path: string) => path.split("/").at(-1) ?? path;
const parent = (path: string) => path.split("/").slice(0, -1).join("/");

// One at a time, so parallel files never race to create the same folder.
const makeFolders = Effect.fn("SaveFolder.folders")(function* makeFolders(
  root: Folder,
  paths: readonly string[],
) {
  const folders = new Map<string, Folder>([["", root]]);
  for (const path of paths) {
    let at = root;
    let key = "";
    for (const segment of parent(path).split("/").filter(Boolean)) {
      key = key === "" ? segment : `${key}/${segment}`;
      const inside = at;
      at =
        folders.get(key) ??
        (yield* disk(path, async () => await inside.getDirectoryHandle(segment, { create: true })));
      folders.set(key, at);
    }
  }
  return folders;
});

/**
 * Brings one file on disk up to its full size. What is already there counts:
 * a full-size file is skipped, a shorter one continues with a Range request.
 * Whatever arrived before a failure is committed, so the retry carries on.
 */
const writeFile = Effect.fn("SaveFolder.write")(function* writeFile(
  target: SavedFile,
  file: SharedFile,
  url: string,
  onDisk: (bytes: number) => void,
) {
  let have = (yield* disk(file.path, async () => await target.getFile())).size;
  onDisk(have);
  if (have === file.size) {
    return have;
  }
  const resume = have > 0 && have < file.size;
  const response = yield* network(
    file.path,
    async (signal) =>
      await fetch(url, { headers: resume ? { range: `bytes=${have}-` } : {}, signal }),
  );
  if (response.status !== 200 && !(resume && response.status === 206)) {
    // An expired signature (403) or a purged object (404) included: the retry
    // re-opens the link, which signs fresh URLs or says why it can't.
    return yield* new SaveStopped({
      cause: new Error(`Storage answered ${response.status}`),
      path: file.path,
      reason: "network",
    });
  }
  // A 200 is the whole file again, so it overwrites from the start.
  if (response.status === 200) {
    have = 0;
    onDisk(0);
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return yield* new SaveStopped({
      cause: new Error("Storage sent no body"),
      path: file.path,
      reason: "network",
    });
  }
  let writable = yield* disk(
    file.path,
    async () => await target.createWritable({ keepExistingData: have > 0 }),
  );
  let saved = have;
  return yield* Effect.gen(function* stream() {
    if (have > 0) {
      const from = have;
      yield* disk(file.path, async () => {
        await writable.seek(from);
      });
    }
    for (;;) {
      const chunk = yield* network(file.path, async () => await reader.read());
      if (chunk.done) {
        break;
      }
      // workers-types gives fetch bodies `any` chunks; browsers send bytes.
      const bytes: unknown = chunk.value;
      if (!ArrayBuffer.isView(bytes)) {
        return yield* new SaveStopped({
          cause: new Error("Storage sent something other than bytes"),
          path: file.path,
          reason: "network",
        });
      }
      const out = writable;
      yield* disk(file.path, async () => {
        await out.write(bytes);
      });
      have += bytes.byteLength;
      onDisk(have);
      if (have - saved >= Math.max(CHECKPOINT, saved)) {
        yield* disk(file.path, async () => {
          await out.close();
        });
        saved = have;
        const next = yield* disk(
          file.path,
          async () => await target.createWritable({ keepExistingData: true }),
        );
        const from = have;
        yield* disk(file.path, async () => {
          await next.seek(from);
        });
        writable = next;
      }
    }
    if (have !== file.size) {
      return yield* new SaveStopped({
        cause: new Error(`Got ${have} of ${file.size} bytes`),
        path: file.path,
        reason: "network",
      });
    }
    yield* disk(file.path, async () => {
      await writable.close();
    });
    return have;
  }).pipe(
    // Commit what arrived, on failure and on interruption alike. A writable
    // that already failed rejects close() and keeps its last commit.
    Effect.onError(() =>
      Effect.promise(async () => {
        await Promise.allSettled([reader.cancel(), writable.close()]);
      }),
    ),
  );
});

const isTransient = (error: { readonly _tag: string }) =>
  error._tag === "RpcClientError" || (error instanceof SaveStopped && error.reason === "network");

/**
 * Saves every file of a shared delivery into a picked folder, recreating its
 * subfolders. Picking the same folder again after a reload carries on.
 */
export const saveFolder = Effect.fn("SaveFolder.save")(function* saveFolder(
  root: Folder,
  link: { readonly token: string; readonly unlock: string | undefined },
  report: (progress: { bytes: number; current: string; files: number }) => void,
) {
  const api = yield* ApiClient;
  const urls = new Map<string, string>();
  const open = api.OpenLink(link).pipe(
    Effect.map(({ files }) => {
      for (const file of files) {
        urls.set(file.path, file.url);
      }
      return files;
    }),
  );
  const files = yield* retryTransport(open);
  const folders = yield* makeFolders(
    root,
    files.map((file) => file.path),
  );

  const progress = { bytes: 0, current: "", files: 0 };
  let shownAt = 0;
  const show = (now: boolean) => {
    if (now || Date.now() - shownAt >= 250) {
      shownAt = Date.now();
      report({ ...progress });
    }
  };

  // Tells the sender, and never holds the save up: a lost report only leaves
  // the sender's count low, and picking the same folder again reports it anew.
  const tell = (path: string, event: "saved" | "started") =>
    api.ReportDownload({ event, path, ...link }).pipe(Effect.ignore, Effect.forkDetach);

  const saveOne = Effect.fn("SaveFolder.file")(function* saveOne(file: SharedFile) {
    progress.current = file.path;
    show(true);
    yield* tell(file.path, "started");
    const folder = folders.get(parent(file.path)) ?? root;
    const target = yield* disk(
      file.path,
      async () => await folder.getFileHandle(basename(file.path), { create: true }),
    );
    let counted = 0;
    const onDisk = (bytes: number) => {
      progress.bytes += bytes - counted;
      counted = bytes;
      show(false);
    };
    yield* Effect.suspend(() =>
      writeFile(target, file, urls.get(file.path) ?? file.url, onDisk),
    ).pipe(
      Effect.tapError((error) =>
        isTransient(error) ? untilOnline.pipe(Effect.andThen(open)) : Effect.void,
      ),
      Effect.retry({
        schedule: Schedule.exponential("1 second").pipe(
          Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, RETRY_CAP))),
        ),
        times: MAX_RETRIES,
        while: isTransient,
      }),
    );
    yield* tell(file.path, "saved");
    progress.files += 1;
    show(true);
  });

  yield* Effect.all(files.map(saveOne), { concurrency: PARALLEL_FILES, discard: true });
});

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Schedule from "effect/Schedule";

const SCRIPT = fileURLToPath(new URL("../tools/synthfile.py", import.meta.url));
const MIB = 1024 * 1024;

class MountNotReadyError extends Data.TaggedError("MountNotReadyError")<{
  readonly message: string;
}> {}

export interface SynthFileArgs {
  readonly dir: string;
  readonly flip?: number;
  readonly mtimeMs: number;
  readonly name: string;
  readonly seed: string;
  readonly size: number;
}

/**
 * Mounts a deterministic file over FUSE and returns its path. The mount lives
 * for the surrounding scope: on release the script gets SIGTERM and
 * `fusermount3 -u` removes anything still mounted — unmounting the session
 * ends the FUSE loop and exits the process even if the signal can't be
 * delivered mid-op.
 */
export const mountSynthFile = (args: SynthFileArgs) =>
  Effect.acquireRelease(
    Effect.gen(function* mount() {
      const child = spawn(
        "uv",
        [
          "run",
          "--script",
          SCRIPT,
          args.dir,
          "--name",
          args.name,
          "--size",
          String(args.size),
          "--seed",
          args.seed,
          "--mtime-ms",
          String(args.mtimeMs),
          ...(args.flip === undefined ? [] : ["--flip", String(args.flip)]),
        ],
        { detached: true, stdio: ["ignore", "inherit", "inherit"] },
      );
      const filePath = path.join(args.dir, args.name);
      // FUSE setup is quick; 30 s covers a cold uv resolve.
      yield* Effect.tryPromise({
        catch: () => new MountNotReadyError({ message: `${filePath} not visible yet` }),
        try: async () => {
          const info = await stat(filePath);
          if (info.size !== args.size) {
            throw new Error(`${filePath} is ${info.size} bytes, expected ${args.size}`);
          }
        },
      }).pipe(
        Effect.retry({
          schedule: Schedule.spaced("100 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
        }),
        Effect.catch(() =>
          Effect.die(new Error(`synth file ${filePath} never appeared; is fuse3 available?`)),
        ),
      );
      return child;
    }),
    (child) =>
      Effect.promise(async () => {
        if (child.exitCode === null && child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            // Already gone.
          }
        }
        const fusermount = spawn("fusermount3", ["-u", args.dir], { stdio: "ignore" });
        await once(fusermount, "close");
        if (child.exitCode === null) {
          try {
            await once(child, "exit", { signal: AbortSignal.timeout(5000) });
          } catch {
            if (child.pid !== undefined) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                // Already gone.
              }
            }
          }
        }
      }),
  ).pipe(Effect.map(() => path.join(args.dir, args.name)));

export interface HashResult {
  readonly bytes: number;
  readonly bytesPerSecond: number;
  readonly seconds: number;
  readonly sha256: string;
}

/** Streams a file through sha256 in 8 MiB reads and reports throughput. */
export const sha256File = (filePath: string) =>
  Effect.promise(async () => {
    const hash = createHash("sha256");
    const started = performance.now();
    let bytes = 0;
    const stream: AsyncIterable<Buffer> = createReadStream(filePath, {
      highWaterMark: 8 * MIB,
    });
    for await (const chunk of stream) {
      bytes += chunk.length;
      hash.update(chunk);
    }
    const seconds = (performance.now() - started) / 1000;
    return { bytes, bytesPerSecond: bytes / seconds, seconds, sha256: hash.digest("hex") };
  });

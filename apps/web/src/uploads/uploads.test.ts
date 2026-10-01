import { describe, expect, it } from "@effect/vitest";
import { InvalidUpload, NotUploaded } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { fingerprint } from "./recovery";
import { chosenFiles, deliveryTitle, retryWhileNotUploaded, toUploadRequest } from "./uploads";

const file = (name: string, relativePath = "") =>
  Object.assign(new File(["x"], name), { relativePath });

// Fails with each error in turn, then succeeds; counts every call.
const finalizeFailing = (errors: readonly (NotUploaded | InvalidUpload)[]) => {
  let calls = 0;
  const finalize = Effect.suspend(() => {
    const error = errors[calls];
    calls += 1;
    return error === undefined ? Effect.succeed("finalized") : Effect.fail(error);
  });
  return { calls: () => calls, finalize };
};

describe("finalize", () => {
  it.effect("finalize_retries_not_uploaded_with_backoff_until_it_lands", () =>
    Effect.gen(function* landsAfterBackoff() {
      const { calls, finalize } = finalizeFailing([new NotUploaded(), new NotUploaded()]);
      const fiber = yield* Effect.forkChild(retryWhileNotUploaded(finalize));
      yield* TestClock.adjust("800 millis");
      expect(calls()).toBe(2);
      yield* TestClock.adjust("1600 millis");
      expect(yield* Fiber.join(fiber)).toBe("finalized");
      expect(calls()).toBe(3);
    }),
  );

  it.effect("finalize_gives_up_after_three_retries", () =>
    Effect.gen(function* givesUp() {
      const { calls, finalize } = finalizeFailing(
        Array.from({ length: 9 }, () => new NotUploaded()),
      );
      const fiber = yield* Effect.forkChild(Effect.flip(retryWhileNotUploaded(finalize)));
      yield* TestClock.adjust("1 minute");
      expect((yield* Fiber.join(fiber))._tag).toBe("NotUploaded");
      expect(calls()).toBe(4);
    }),
  );

  it.effect("finalize_does_not_retry_other_failures", () =>
    Effect.gen(function* stopsOnOthers() {
      const { calls, finalize } = finalizeFailing([new InvalidUpload()]);
      const error = yield* Effect.flip(retryWhileNotUploaded(finalize));
      expect(error._tag).toBe("InvalidUpload");
      expect(calls()).toBe(1);
    }),
  );
});

describe("signing", () => {
  it("signs_uploads_but_never_aborts", () => {
    expect(toUploadRequest({ key: "k", method: "POST" })).toEqual({ _tag: "Create" });
    expect(toUploadRequest({ key: "k", method: "PUT", partNumber: 3, uploadId: "u" })).toEqual({
      _tag: "Part",
      partNumber: 3,
      uploadId: "u",
    });
    expect(toUploadRequest({ key: "k", method: "GET", uploadId: "u" })).toEqual({
      _tag: "List",
      uploadId: "u",
    });
    // A continued ListParts page carries its marker into the signed request.
    expect(
      toUploadRequest({ key: "k", method: "GET", partNumberMarker: 1000, uploadId: "u" }),
    ).toEqual({
      _tag: "List",
      partNumberMarker: 1000,
      uploadId: "u",
    });
    expect(toUploadRequest({ key: "k", method: "POST", uploadId: "u" })).toEqual({
      _tag: "Complete",
      uploadId: "u",
    });
    expect(toUploadRequest({ key: "k", method: "PUT" })).toEqual({ _tag: "Put" });
    expect(toUploadRequest({ key: "k", method: "DELETE", uploadId: "u" })).toBeNull();
  });
});

describe("fingerprint", () => {
  it.effect("a small file hashes whole; a large one samples deterministically", () =>
    Effect.gen(function* fingerprinting() {
      // sha256("x"), the whole-file path.
      expect((yield* fingerprint(new Blob(["x"]))).sha256).toBe(
        "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
      );
      const size = 2 * 1024 * 1024;
      const data = Uint8Array.from({ length: size }, (_, index) => index % 251);
      const first = yield* fingerprint(new Blob([data]));
      // Sixteen 64 KiB samples at Math.floor(i * (size - 65536) / 15).
      const samples = Array.from({ length: 16 }, (_, index) => {
        const offset = Math.floor((index * (size - 65_536)) / 15);
        return data.slice(offset, offset + 65_536);
      });
      const digest = yield* Effect.promise(
        async () => await crypto.subtle.digest("SHA-256", await new Blob(samples).arrayBuffer()),
      );
      const expected = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      expect(first.sha256).toBe(expected);
      expect(yield* fingerprint(new Blob([data]))).toEqual(first);
    }),
  );
});

describe("choosing files", () => {
  it("folder_drops_keep_paths_and_skip_os_litter", () => {
    const chosen = chosenFiles([
      file("a.mov", "/Shoot/a.mov"),
      file(".DS_Store", "/Shoot/.DS_Store"),
      file("._a.mov", "/Shoot/._a.mov"),
      file("b.wav", "/Shoot/audio/b.wav"),
    ]);
    expect(chosen.map(({ path }) => path)).toEqual(["Shoot/a.mov", "Shoot/audio/b.wav"]);
    expect(deliveryTitle(chosen)).toBe("Shoot");
  });

  it("loose_files_title_after_the_first_file", () => {
    expect(deliveryTitle(chosenFiles([file("a.mov")]))).toBe("a.mov");
    expect(deliveryTitle(chosenFiles([file("a.mov"), file("b.mov"), file("c.mov")]))).toBe(
      "a.mov and 2 more",
    );
  });
});

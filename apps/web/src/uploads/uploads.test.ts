import { describe, expect, it } from "@effect/vitest";
import { InvalidUpload, NotUploaded } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { md5 } from "hash-wasm";

import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError";

import { fingerprint } from "./recovery";
import {
  chosenFiles,
  deliveryTitle,
  isTransientUploadError,
  retryTransport,
  retryWhileNotUploaded,
  toUploadRequest,
  verifyParts,
} from "./uploads";

const file = (name: string, relativePath = "") =>
  Object.assign(new File(["x"], name), { relativePath });

const etag = (bytes: readonly number[]) =>
  Effect.promise(async () => await md5(Uint8Array.from(bytes)));

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

const transportError = () =>
  new RpcClientError({
    reason: new RpcClientDefect({ cause: new Error("network down"), message: "network down" }),
  });

describe("transport", () => {
  it.effect("transport_failures_retry_with_backoff_until_signing_lands", () =>
    Effect.gen(function* landsAfterBackoff() {
      let attempts = 0;
      const call = Effect.suspend(() => {
        attempts += 1;
        return attempts <= 2 ? Effect.fail(transportError()) : Effect.succeed("signed");
      });
      const fiber = yield* Effect.forkChild(retryTransport(call));
      yield* TestClock.adjust("1 second");
      expect(attempts).toBe(2);
      yield* TestClock.adjust("2 seconds");
      expect(yield* Fiber.join(fiber)).toBe("signed");
      expect(attempts).toBe(3);
    }),
  );

  it.effect("typed_refusals_never_retry", () =>
    Effect.gen(function* noRetry() {
      let attempts = 0;
      const call = Effect.suspend(() => {
        attempts += 1;
        return Effect.fail(new InvalidUpload());
      });
      const error = yield* Effect.flip(retryTransport(call));
      expect(error._tag).toBe("InvalidUpload");
      expect(attempts).toBe(1);
    }),
  );

  it.effect("offline_signing_waits_for_online_before_trying", () =>
    Effect.gen(function* waitsForOnline() {
      const onLine = { value: false };
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine.value });
      try {
        let attempts = 0;
        const call = Effect.suspend(() => {
          attempts += 1;
          return Effect.succeed("signed");
        });
        const fiber = yield* Effect.forkChild(retryTransport(call));
        yield* TestClock.adjust("1 hour");
        expect(attempts).toBe(0);
        onLine.value = true;
        window.dispatchEvent(new Event("online"));
        expect(yield* Fiber.join(fiber)).toBe("signed");
        expect(attempts).toBe(1);
      } finally {
        // The override lives on the navigator instance; removing it exposes
        // Navigator.prototype's real onLine again.
        Reflect.deleteProperty(navigator, "onLine");
      }
    }),
  );
});

// Minified names, as the deployed bundle renames Uppy's error classes.
const s3ServiceError = (status: number) =>
  Object.assign(new Error("x"), { code: null, name: "OV", status });

describe("isTransientUploadError", () => {
  it("transient_upload_errors_are_network_expiry_throttling_and_5xx", () => {
    expect(
      isTransientUploadError(Object.assign(new Error("x"), { code: "NETWORK", name: "DV" })),
    ).toBe(true);
    for (const status of [403, 408, 429, 500, 503]) {
      expect(isTransientUploadError(s3ServiceError(status))).toBe(true);
    }
  });

  it("remote_gone_and_refusals_stay_final", () => {
    expect(isTransientUploadError(s3ServiceError(404))).toBe(false);
    expect(isTransientUploadError(s3ServiceError(400))).toBe(false);
    expect(isTransientUploadError(new Error("plain"))).toBe(false);
    // @ts-expect-error runtime garbage reaches the guard untyped.
    expect(isTransientUploadError("network down")).toBe(false);
  });
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

describe("verifyParts", () => {
  it.effect("passes matching parts and fails a flipped byte or a wrong size", () =>
    Effect.gen(function* verifying() {
      const blob = new Blob([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]);
      const parts = [
        { etag: yield* etag([1, 2, 3, 4]), partNumber: 1, size: 4 },
        { etag: yield* etag([5, 6, 7, 8]), partNumber: 2, size: 4 },
        // The last part is the remainder, shorter than the part size.
        { etag: yield* etag([9, 10]), partNumber: 3, size: 2 },
      ];
      expect(yield* verifyParts(blob, parts, 4)).toBe(true);

      const flippedEtag = yield* etag([5, 6, 7, 0]);
      const flipped = parts.map((part) =>
        part.partNumber === 2 ? { ...part, etag: flippedEtag } : part,
      );
      expect(yield* verifyParts(blob, flipped, 4)).toBe(false);

      const wrongSize = parts.map((part) => (part.partNumber === 2 ? { ...part, size: 5 } : part));
      expect(yield* verifyParts(blob, wrongSize, 4)).toBe(false);

      // A part number past partCount has no expected bytes left.
      const extra = [...parts, { etag: yield* etag([11]), partNumber: 4, size: 1 }];
      expect(yield* verifyParts(blob, extra, 4)).toBe(false);
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

import { expect, layer } from "@effect/vitest";
import { partSize } from "@tranzfer/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { Deliveries } from "../src/implementation/deliveries";
import { Transfers } from "../src/implementation/transfers";
import {
  addUser,
  domainLayer,
  first,
  firstTwo,
  makeMemoryStorage,
  newDelivery,
  newFile,
} from "./support";

const storage = makeMemoryStorage();
const MIB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

// D1 stamps updatedAt from the wall clock; start the test clock there too.
const atWallClock = TestClock.setTime(Date.now());

const seed = (sender: string, files: ReturnType<typeof newFile>[]) =>
  Effect.gen(function* seedDelivery() {
    yield* addUser(sender);
    const deliveries = yield* Deliveries;
    return yield* deliveries.create(sender, newDelivery(files));
  });

layer(domainLayer(storage.layer))("Transfers", (it) => {
  it.effect("signs only the upload shape that fits the file size", () =>
    Effect.gen(function* scenario() {
      const created = yield* seed("ann", [newFile("small.txt", 10), newFile("big.bin", 200 * MIB)]);
      const transfers = yield* Transfers;
      const [{ objectKey: bigKey }, { objectKey: smallKey }] = firstTwo(created.transfers);

      const put = yield* transfers.sign("ann", smallKey, { _tag: "Put" });
      expect(put.url).toBe(`memory://Put/${smallKey}`);
      const wrong = yield* Effect.flip(transfers.sign("ann", bigKey, { _tag: "Put" }));
      expect(wrong._tag).toBe("InvalidUpload");
      const tooFar = yield* Effect.flip(
        transfers.sign("ann", bigKey, {
          _tag: "Part",
          partNumber: Math.ceil((200 * MIB) / partSize(200 * MIB)) + 1,
          uploadId: "u",
        }),
      );
      expect(tooFar._tag).toBe("InvalidUpload");
      const stranger = yield* Effect.flip(transfers.sign("someone", smallKey, { _tag: "Put" }));
      expect(stranger._tag).toBe("DeliveryNotFound");
    }),
  );

  it.effect("finalizes once the object is there, then flips the delivery to ready", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      const start = yield* Clock.currentTimeMillis;
      const created = yield* seed("ben", [newFile("one.txt", 4), newFile("two.txt", 6)]);
      const transfers = yield* Transfers;
      const [one, two] = firstTwo(created.transfers);

      const missing = yield* Effect.flip(transfers.finalize("ben", one.id));
      expect(missing._tag).toBe("NotUploaded");

      storage.objects.set(one.objectKey, { etag: "a", size: 99 });
      const wrongSize = yield* Effect.flip(transfers.finalize("ben", one.id));
      expect(wrongSize._tag).toBe("InvalidUpload");

      storage.objects.set(one.objectKey, { etag: "a", size: 4 });
      const halfway = yield* transfers.finalize("ben", one.id);
      expect(halfway.status).toBe("open");
      expect(yield* transfers.finalize("ben", one.id)).toEqual(halfway);

      storage.objects.set(two.objectKey, { etag: "b", size: 6 });
      const ready = yield* transfers.finalize("ben", two.id);
      expect(ready.status).toBe("ready");
      expect(ready.expiresAt?.getTime()).toBe(start + 3 * DAY_MS);
    }),
  );

  it.effect("closes signing and finalize once the delivery is cancelled", () =>
    Effect.gen(function* scenario() {
      const created = yield* seed("cat", [newFile("a.txt", 1), newFile("b.txt", 1)]);
      const deliveries = yield* Deliveries;
      const transfers = yield* Transfers;
      const [one] = firstTwo(created.transfers);
      yield* deliveries.cancel("cat", created.id);

      const sign = yield* Effect.flip(transfers.sign("cat", one.objectKey, { _tag: "Put" }));
      expect(sign._tag).toBe("UploadClosed");
      storage.objects.set(one.objectKey, { etag: "x", size: 1 });
      const finalize = yield* Effect.flip(transfers.finalize("cat", one.id));
      expect(finalize._tag).toBe("UploadClosed");
    }),
  );

  it.effect("the sweeper finishes a transfer whose browser left after upload", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      const created = yield* seed("dan", [newFile("left.txt", 7), newFile("stays.txt", 3)]);
      const transfers = yield* Transfers;
      const [left, stays] = firstTwo(created.transfers);

      // Signing the PUT marks the transfer finalizing; the browser then vanishes.
      yield* transfers.sign("dan", left.objectKey, { _tag: "Put" });
      yield* transfers.sign("dan", stays.objectKey, { _tag: "Put" });
      storage.objects.set(left.objectKey, { etag: "l", size: 7 });

      expect(yield* transfers.recoverFinalizing).toBe(0);
      yield* TestClock.adjust("3 minutes");
      // Only the one whose bytes landed completes; the other waits.
      expect(yield* transfers.recoverFinalizing).toBe(1);
      const deliveries = yield* Deliveries;
      const view = yield* deliveries.view(created.id);
      expect(view.transfers.map((transfer) => transfer.state)).toEqual(["complete", "finalizing"]);
      expect(view.status).toBe("open");
    }),
  );

  it.effect("expired deliveries read as expired and get purged", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      const created = yield* seed("eve", [newFile("only.txt", 2)]);
      const transfers = yield* Transfers;
      const deliveries = yield* Deliveries;
      const only = first(created.transfers);
      storage.objects.set(only.objectKey, { etag: "o", size: 2 });
      yield* transfers.finalize("eve", only.id);

      yield* TestClock.adjust("4 days");
      expect((yield* deliveries.view(created.id)).status).toBe("expired");
      expect(yield* deliveries.purgeEnded).toBeGreaterThanOrEqual(1);
      expect(storage.objects.has(only.objectKey)).toBe(false);
    }),
  );
});

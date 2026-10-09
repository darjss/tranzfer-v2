import { expect, layer } from "@effect/vitest";
import { DeliveryId, partSize, rateLimits } from "@tranzfer/contracts";
import { Database, schema } from "@tranzfer/db";
import { eq } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { Deliveries } from "../src/deliveries";
import { FileRequests } from "../src/file-requests";
import { Transfers } from "../src/transfers";
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
  it.effect("signs uploads while open, then only the final steps once finalizing", () =>
    Effect.gen(function* scenario() {
      const created = yield* seed("ann", [newFile("big.bin", 200 * MIB), newFile("small.txt", 10)]);
      const transfers = yield* Transfers;
      const [{ objectKey: bigKey }, { objectKey: smallKey }] = firstTwo(created.transfers);

      const create = yield* transfers.sign("ann", smallKey, { _tag: "Create" });
      expect(create.url).toBe(`memory://Create/${smallKey}`);
      const tooFar = yield* Effect.flip(
        transfers.sign("ann", bigKey, {
          _tag: "Part",
          partNumber: Math.ceil((200 * MIB) / partSize(200 * MIB)) + 1,
          uploadId: "u",
        }),
      );
      expect(tooFar._tag).toBe("InvalidUpload");
      const stranger = yield* Effect.flip(transfers.sign("someone", smallKey, { _tag: "Create" }));
      expect(stranger._tag).toBe("DeliveryNotFound");

      // Signing Complete moves the transfer to finalizing: retries of the last
      // steps still sign, and parts on the existing upload id sign too, so a
      // lost Complete with missing parts can finish. A new upload cannot.
      yield* transfers.sign("ann", smallKey, { _tag: "Complete", uploadId: "u" });
      yield* transfers.sign("ann", smallKey, { _tag: "Complete", uploadId: "u" });
      yield* transfers.sign("ann", smallKey, { _tag: "List", uploadId: "u" });
      // ListParts pagination signs again with the page marker.
      yield* transfers.sign("ann", smallKey, {
        _tag: "List",
        partNumberMarker: 1000,
        uploadId: "u",
      });
      const reopen = yield* Effect.flip(transfers.sign("ann", smallKey, { _tag: "Create" }));
      expect(reopen._tag).toBe("UploadClosed");
      const morePart = yield* transfers.sign("ann", smallKey, {
        _tag: "Part",
        partNumber: 1,
        uploadId: "u",
      });
      expect(morePart.url).toBe(`memory://Part/${smallKey}`);
      const tooMany = yield* Effect.flip(
        transfers.sign("ann", smallKey, { _tag: "Part", partNumber: 2, uploadId: "u" }),
      );
      expect(tooMany._tag).toBe("InvalidUpload");
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

      expect(storage.sealed).toContain(one.objectKey);
      // A missing object is never sealed, so an upload still running survives.
      expect(storage.sealed).not.toContain(two.objectKey);

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

      const sign = yield* Effect.flip(transfers.sign("cat", one.objectKey, { _tag: "Create" }));
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

      // Signing Complete marks the transfer finalizing; the browser then vanishes.
      yield* transfers.sign("dan", left.objectKey, { _tag: "Complete", uploadId: "u" });
      yield* transfers.sign("dan", stays.objectKey, { _tag: "Complete", uploadId: "u" });
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

  it.effect("a sweep flips a delivery whose finalize died between its two writes", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      const start = yield* Clock.currentTimeMillis;
      const created = yield* seed("fay", [newFile("done.txt", 5)]);
      const transfers = yield* Transfers;
      const { db } = yield* Database;
      // The transfer write landed; the delivery flip never ran.
      yield* db
        .update(schema.transfer)
        .set({ state: "complete" })
        .where(eq(schema.transfer.deliveryId, created.id));

      yield* transfers.recoverFinalizing;
      const deliveries = yield* Deliveries;
      const view = yield* deliveries.view(created.id);
      expect(view.status).toBe("ready");
      expect(view.expiresAt?.getTime()).toBe(start + 3 * DAY_MS);
    }),
  );

  it.effect("an empty file re-signs its guarded Put after a lost response", () =>
    Effect.gen(function* scenario() {
      const created = yield* seed("gus", [newFile("empty.txt", 0)]);
      const transfers = yield* Transfers;
      const { objectKey } = first(created.transfers);

      const wrongKind = yield* Effect.flip(transfers.sign("gus", objectKey, { _tag: "Create" }));
      expect(wrongKind._tag).toBe("InvalidUpload");
      // The first response is lost; the retry still gets a URL. If-None-Match
      // (signed by the real storage) is what stops a second write.
      yield* transfers.sign("gus", objectKey, { _tag: "Put" });
      yield* transfers.sign("gus", objectKey, { _tag: "Put" });
    }),
  );

  it.effect("a file of one part or less signs a guarded Put; a bigger one does not", () =>
    Effect.gen(function* scenario() {
      const created = yield* seed("hal", [
        newFile("small.bin", 3 * MIB),
        newFile("edge.bin", partSize(0)),
        newFile("big.bin", partSize(0) + 1),
      ]);
      const transfers = yield* Transfers;
      const key = (path: string) => {
        const found = created.transfers.find((transfer) => transfer.path === path);
        if (found === undefined) {
          throw new Error(`missing ${path}`);
        }
        return found.objectKey;
      };

      const put = yield* transfers.sign("hal", key("small.bin"), { _tag: "Put" });
      expect(put.url).toBe(`memory://Put/${key("small.bin")}`);
      // Signing the Put is the point the object may land unseen, so the
      // sweeper's state is set and no multipart upload can start after it.
      const reopen = yield* Effect.flip(
        transfers.sign("hal", key("small.bin"), { _tag: "Create" }),
      );
      expect(reopen._tag).toBe("UploadClosed");
      // A lost response signs again; If-None-Match makes the second write fail.
      yield* transfers.sign("hal", key("small.bin"), { _tag: "Put" });
      yield* transfers.sign("hal", key("edge.bin"), { _tag: "Put" });

      const tooBig = yield* Effect.flip(transfers.sign("hal", key("big.bin"), { _tag: "Put" }));
      expect(tooBig._tag).toBe("InvalidUpload");
      // Transfers that began as multipart before single PUTs existed still can.
      yield* transfers.sign("hal", key("big.bin"), { _tag: "Create" });
    }),
  );

  it.effect("holds Free senders to the signing rate, and paid plans not at all", () =>
    Effect.gen(function* scenario() {
      const free = first((yield* seed("fern", [newFile("a.bin", 200 * MIB)])).transfers);
      const comp = first((yield* seed("cole", [newFile("a.bin", 200 * MIB)])).transfers);
      const { db } = yield* Database;
      yield* db
        .insert(schema.subscription)
        .values({ plan: "studio", status: "comp", userId: "cole" });
      const transfers = yield* Transfers;
      const { limit, windowSeconds } = rateLimits.uploadSigning;
      const create = (sender: string, key: string) =>
        transfers.sign(sender, key, { _tag: "Create" });

      yield* Effect.forEach(Arr.range(1, limit), () => create("fern", free.objectKey));
      expect(yield* Effect.flip(create("fern", free.objectKey))).toMatchObject({
        _tag: "RateLimited",
        limit: "uploadSigning",
        retryAfterSeconds: windowSeconds,
      });
      yield* Effect.forEach(Arr.range(1, limit + 1), () => create("cole", comp.objectKey));
    }),
  );

  it.effect("stops signing once the delivery is past its upload window", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      const created = yield* seed("ivy", [newFile("slow.bin", 9)]);
      const transfers = yield* Transfers;
      const { objectKey } = first(created.transfers);

      yield* TestClock.adjust("6 days");
      yield* transfers.sign("ivy", objectKey, { _tag: "Create" });
      yield* TestClock.adjust("2 days");
      const late = yield* Effect.flip(transfers.sign("ivy", objectKey, { _tag: "Create" }));
      expect(late._tag).toBe("UploadClosed");
    }),
  );
  it.effect("an uploader signs and finalizes through their request and nowhere else", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      const start = yield* Clock.currentTimeMillis;
      yield* addUser("rex");
      const requests = yield* FileRequests;
      const deliveries = yield* Deliveries;
      const open = (title: string) =>
        requests.create("rex", { instructions: "", maxBytes: null, retentionDays: 3, title });
      const token = (yield* open("Dailies")).link.slice("/r/".length);
      const otherToken = (yield* open("Other")).link.slice("/r/".length);
      const ip = "192.0.2.1";
      const sent = yield* requests.receive(
        {
          email: null,
          files: [newFile("a.mov", 4), newFile("b.mov", 6)],
          id: DeliveryId.make(crypto.randomUUID()),
          name: "Jo",
          token,
        },
        ip,
      );
      const [a, b] = firstTwo(sent.transfers);
      const own = first(
        (yield* deliveries.create("rex", newDelivery([newFile("own.txt", 1)]))).transfers,
      );

      const signed = yield* requests.sign(token, ip, a.objectKey, { _tag: "Put" });
      expect(signed.url).toBe(`memory://Put/${a.objectKey}`);
      // The owner's own delivery and another request's file are out of reach.
      const reachable = yield* Effect.all([
        Effect.flip(requests.sign(token, ip, own.objectKey, { _tag: "Put" })),
        Effect.flip(requests.sign(otherToken, ip, a.objectKey, { _tag: "Put" })),
        Effect.flip(requests.finalize(otherToken, ip, a.id)),
        Effect.flip(requests.finalize(token, ip, own.id)),
      ]);
      expect(reachable.map((error) => error._tag)).toEqual(Arr.replicate("DeliveryNotFound", 4));

      storage.objects.set(a.objectKey, { etag: "a", size: 4 });
      expect((yield* requests.finalize(token, ip, a.id)).status).toBe("open");
      storage.objects.set(b.objectKey, { etag: "b", size: 6 });
      const done = yield* requests.finalize(token, ip, b.id);
      expect(done.status).toBe("ready");
      expect((yield* deliveries.view(sent.id)).expiresAt?.getTime()).toBe(start + 3 * DAY_MS);
    }),
  );

  it.effect("an uploader's signing spends the portal budget and not the owner's", () =>
    Effect.gen(function* scenario() {
      yield* addUser("sue");
      const requests = yield* FileRequests;
      const transfers = yield* Transfers;
      const made = yield* requests.create("sue", {
        instructions: "",
        maxBytes: null,
        retentionDays: 3,
        title: "Dailies",
      });
      const token = made.link.slice("/r/".length);
      const sent = yield* requests.receive(
        {
          email: null,
          files: [newFile("a.mov", 4)],
          id: DeliveryId.make(crypto.randomUUID()),
          name: "Jo",
          token,
        },
        "192.0.2.2",
      );
      const { objectKey } = first(sent.transfers);
      yield* Effect.forEach(
        Arr.range(1, rateLimits.uploadSigning.limit + 1),
        () => requests.sign(token, "192.0.2.2", objectKey, { _tag: "Put" }),
        { discard: true },
      );
      // The owner's own count is untouched; their next upload still signs.
      yield* transfers.sign("sue", objectKey, { _tag: "Put" });
    }),
  );

  it.effect("the sweeper finishes an upload whose request closed after the bytes landed", () =>
    Effect.gen(function* scenario() {
      yield* atWallClock;
      yield* addUser("tim");
      const requests = yield* FileRequests;
      const transfers = yield* Transfers;
      const deliveries = yield* Deliveries;
      const made = yield* requests.create("tim", {
        instructions: "",
        maxBytes: null,
        retentionDays: 3,
        title: "Dailies",
      });
      const token = made.link.slice("/r/".length);
      const sent = yield* requests.receive(
        {
          email: null,
          files: [newFile("a.mov", 4)],
          id: DeliveryId.make(crypto.randomUUID()),
          name: "Jo",
          token,
        },
        "192.0.2.3",
      );
      const { objectKey } = first(sent.transfers);
      yield* requests.sign(token, "192.0.2.3", objectKey, { _tag: "Put" });
      storage.objects.set(objectKey, { etag: "a", size: 4 });
      yield* requests.close("tim", made.id);

      yield* TestClock.adjust("3 minutes");
      expect(yield* transfers.recoverFinalizing).toBe(1);
      expect((yield* deliveries.view(sent.id)).status).toBe("ready");
    }),
  );
});

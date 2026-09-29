import { expect, layer } from "@effect/vitest";
import { Database, schema } from "@tranzfer/db";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { Deliveries } from "../src/implementation/deliveries";
import { addUser, domainLayer, first, makeMemoryStorage, newDelivery, newFile } from "./support";

const storage = makeMemoryStorage();

layer(domainLayer(storage.layer))("Deliveries", (it) => {
  it.effect("creates a delivery with one transfer per file and a link", () =>
    Effect.gen(function* scenario() {
      yield* addUser("alice");
      const deliveries = yield* Deliveries;
      const input = newDelivery([newFile("a/one.txt", 5), newFile("a/two.bin", 9)], "Shoot");
      const created = yield* deliveries.create("alice", input);
      expect(created.status).toBe("open");
      expect(created.title).toBe("Shoot");
      expect(created.transfers.map((transfer) => transfer.path)).toEqual([
        "a/one.txt",
        "a/two.bin",
      ]);
      expect(created.link).toMatch(/^\/d\/.+\..+$/u);
    }),
  );

  it.effect("replays an identical create and rejects a changed one", () =>
    Effect.gen(function* scenario() {
      yield* addUser("bob");
      const deliveries = yield* Deliveries;
      const input = newDelivery([newFile("x.txt", 1)]);
      const original = yield* deliveries.create("bob", input);
      const replay = yield* deliveries.create("bob", input);
      expect(replay).toEqual(original);

      const changed = yield* Effect.flip(
        deliveries.create("bob", {
          files: input.files,
          id: input.id,
          retentionDays: input.retentionDays,
          title: "Other",
        }),
      );
      expect(changed._tag).toBe("DeliveryConflict");
      const stranger = yield* Effect.flip(deliveries.create("alice", input));
      expect(stranger._tag).toBe("DeliveryConflict");
    }),
  );

  it.effect("rejects a new delivery that reuses a transfer id", () =>
    Effect.gen(function* scenario() {
      yield* addUser("carol");
      const deliveries = yield* Deliveries;
      const shared = newFile("shared.txt", 3);
      yield* deliveries.create("carol", newDelivery([shared]));
      const reused = yield* Effect.flip(deliveries.create("carol", newDelivery([shared])));
      expect(reused._tag).toBe("DeliveryConflict");
    }),
  );

  it.effect("creates a thousand files in one delivery", () =>
    Effect.gen(function* scenario() {
      yield* addUser("dave");
      const deliveries = yield* Deliveries;
      const files = Array.from({ length: 1000 }, (_, index) => newFile(`bulk/${index}.txt`, 1));
      const created = yield* deliveries.create("dave", newDelivery(files));
      expect(created.transfers).toHaveLength(1000);
    }),
  );

  it.effect("lists only the sender's deliveries, newest first", () =>
    Effect.gen(function* scenario() {
      yield* addUser("erin");
      yield* addUser("frank");
      const deliveries = yield* Deliveries;
      const older = yield* deliveries.create("erin", newDelivery([newFile("1.txt", 1)], "Older"));
      const newer = yield* deliveries.create("erin", newDelivery([newFile("2.txt", 1)], "Newer"));
      yield* deliveries.create("frank", newDelivery([newFile("3.txt", 1)], "Not Erin's"));
      // D1 stamps createdAt; backdate one so the order doesn't hinge on a millisecond.
      const { db } = yield* Database;
      yield* db
        .update(schema.delivery)
        .set({ createdAt: new Date(Date.now() - 60_000) })
        .where(eq(schema.delivery.id, older.id));
      const listed = yield* deliveries.list("erin");
      expect(listed.map((delivery) => delivery.id)).toEqual([newer.id, older.id]);
    }),
  );

  it.effect("cancels only for the sender, and purges the objects", () =>
    Effect.gen(function* scenario() {
      // D1 stamps updatedAt from the wall clock; start the test clock there too.
      yield* TestClock.setTime(Date.now());
      yield* addUser("gina");
      const deliveries = yield* Deliveries;
      const created = yield* deliveries.create("gina", newDelivery([newFile("f.bin", 4)]));
      const { objectKey } = first(created.transfers);
      storage.objects.set(objectKey, { etag: "e", size: 4 });

      const foreign = yield* Effect.flip(deliveries.cancel("alice", created.id));
      expect(foreign._tag).toBe("DeliveryNotFound");

      const cancelled = yield* deliveries.cancel("gina", created.id);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.transfers.every((t) => t.state === "cancelled")).toBe(true);
      expect(storage.objects.has(objectKey)).toBe(false);
      expect(storage.purged).toContain(`d/${created.id}/`);
      // A Complete in flight during the cancel lands late; the sweeper waits a
      // few minutes, purges again and records it.
      storage.objects.set(objectKey, { etag: "late", size: 4 });
      expect(yield* deliveries.purgeEnded).toBe(0);
      // The window covers a signed upload URL's whole lifetime (15 minutes).
      yield* TestClock.adjust("6 minutes");
      expect(yield* deliveries.purgeEnded).toBe(0);
      yield* TestClock.adjust("11 minutes");
      expect(yield* deliveries.purgeEnded).toBe(1);
      expect(storage.objects.has(objectKey)).toBe(false);
      expect(yield* deliveries.purgeEnded).toBe(0);
    }),
  );

  it.effect("ends an open delivery that never finished, then purges it", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("hank");
      const deliveries = yield* Deliveries;
      const created = yield* deliveries.create("hank", newDelivery([newFile("half.bin", 9)]));
      const recent = yield* deliveries.create("hank", newDelivery([newFile("fresh.bin", 9)]));

      yield* TestClock.adjust("6 days");
      expect(yield* deliveries.purgeEnded).toBe(0);
      expect((yield* deliveries.view(created.id)).status).toBe("open");

      // Past R2's 7-day multipart window nothing can complete, so the sweeper
      // ends it the way a cancel would.
      yield* TestClock.adjust("2 days");
      yield* deliveries.purgeEnded;
      expect((yield* deliveries.view(created.id)).status).toBe("cancelled");
      expect((yield* deliveries.view(created.id)).transfers.map((t) => t.state)).toEqual([
        "cancelled",
      ]);
      expect((yield* deliveries.view(recent.id)).status).toBe("cancelled");
      expect(storage.purged).toContain(`d/${created.id}/`);
    }),
  );
});

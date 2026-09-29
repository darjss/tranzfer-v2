import { expect, layer } from "@effect/vitest";
import { Database, schema } from "@tranzfer/db";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";

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
        .set({ createdAt: new Date(0) })
        .where(eq(schema.delivery.id, older.id));
      const listed = yield* deliveries.list("erin");
      expect(listed.map((delivery) => delivery.id)).toEqual([newer.id, older.id]);
    }),
  );

  it.effect("cancels only for the sender, and purges the objects", () =>
    Effect.gen(function* scenario() {
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
      // Already purged: the sweeper has nothing left to do for it.
      expect(yield* deliveries.purgeEnded).toBe(0);
    }),
  );
});

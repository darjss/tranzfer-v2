import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { Deliveries } from "../src/implementation/deliveries";
import { SharedLinks } from "../src/implementation/shared-links";
import { Transfers } from "../src/implementation/transfers";
import { addUser, domainLayer, first, makeMemoryStorage, newDelivery, newFile } from "./support";

const storage = makeMemoryStorage();

const tokenOf = (link: string) => link.slice("/d/".length);

layer(domainLayer(storage.layer))("SharedLinks", (it) => {
  it.effect("walks a link from not ready to ready to expired", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("sam", "Sam");
      const deliveries = yield* Deliveries;
      const transfers = yield* Transfers;
      const links = yield* SharedLinks;
      const created = yield* deliveries.create(
        "sam",
        newDelivery([newFile("clips/a.mov", 3)], "Clips"),
      );
      const token = tokenOf(created.link);

      const notReady = yield* Effect.flip(links.open(token));
      expect(notReady).toMatchObject({ _tag: "LinkNotReady", senderName: "Sam", title: "Clips" });

      const file = first(created.transfers);
      storage.objects.set(file.objectKey, { etag: "m", size: 3 });
      yield* transfers.finalize("sam", file.id);

      const shared = yield* links.open(token);
      expect(shared.title).toBe("Clips");
      expect(shared.files).toEqual([
        { path: "clips/a.mov", size: 3, url: `memory://get/${file.objectKey}` },
      ]);

      yield* TestClock.adjust("4 days");
      const expired = yield* Effect.flip(links.open(token));
      expect(expired._tag).toBe("LinkExpired");
    }),
  );

  it.effect("tampered, unknown and cancelled links all read as not found", () =>
    Effect.gen(function* scenario() {
      yield* addUser("tom");
      const deliveries = yield* Deliveries;
      const links = yield* SharedLinks;
      const created = yield* deliveries.create("tom", newDelivery([newFile("x", 1)]));
      const token = tokenOf(created.link);

      for (const bad of [`${token}x`, "nope", "a.b.c", ""]) {
        const error = yield* Effect.flip(links.open(bad));
        expect(error._tag).toBe("LinkNotFound");
      }
      yield* deliveries.cancel("tom", created.id);
      const cancelled = yield* Effect.flip(links.open(token));
      expect(cancelled._tag).toBe("LinkNotFound");
    }),
  );
});

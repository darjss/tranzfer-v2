import { expect, layer } from "@effect/vitest";
import { Database } from "@tranzfer/db";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { Deliveries } from "../src/deliveries";
import { SharedLinks } from "../src/shared-links";
import { Transfers } from "../src/transfers";
import { addUser, domainLayer, first, makeMemoryStorage, newDelivery, newFile } from "./support";

const storage = makeMemoryStorage();

const tokenOf = (link: string) => link.slice("/d/".length);

// A ready delivery of one file, with a password if given.
const lockedDelivery = Effect.fn("lockedDelivery")(function* lockedDelivery(
  sender: string,
  password: string | null,
) {
  yield* addUser(sender, "Sam");
  const deliveries = yield* Deliveries;
  const transfers = yield* Transfers;
  const created = yield* deliveries.create(
    sender,
    newDelivery([newFile("secret/a.mov", 3)], "Secret cut"),
  );
  const file = first(created.transfers);
  storage.objects.set(file.objectKey, { etag: "m", size: 3 });
  yield* transfers.finalize(sender, file.id);
  if (password !== null) {
    yield* deliveries.setPassword(sender, created.id, password);
  }
  return { created, file, token: tokenOf(created.link) };
});

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

  it.effect("reports downloads to the owner, once per file, and ignores what it can't place", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("dee");
      yield* addUser("eve");
      const deliveries = yield* Deliveries;
      const transfers = yield* Transfers;
      const links = yield* SharedLinks;
      const created = yield* deliveries.create(
        "dee",
        newDelivery([newFile("a.mov", 3), newFile("b.mov", 4)], "Two"),
      );
      const token = tokenOf(created.link);
      for (const file of created.transfers) {
        storage.objects.set(file.objectKey, { etag: "m", size: file.size });
        yield* transfers.finalize("dee", file.id);
      }
      expect(
        (yield* deliveries.list("dee")).find((row) => row.id === created.id)?.download,
      ).toBeNull();

      // Opening the link is not a download.
      yield* links.open(token);
      expect((yield* deliveries.view(created.id)).download).toBeNull();

      const startedAt = new Date(yield* Clock.currentTimeMillis);
      yield* links.report(token, "a.mov", "started");
      yield* TestClock.adjust("1 minute");
      yield* links.report(token, "a.mov", "saved");
      yield* TestClock.adjust("1 minute");
      // Replays and resumes converge on the same row and the first save stamp.
      yield* links.report(token, "a.mov", "saved");
      yield* links.report(token, "a.mov", "started");
      const lastAt = new Date(yield* Clock.currentTimeMillis);
      // Nothing to place: wrong path, tampered token, another sender's view.
      yield* links.report(token, "nope.mov", "saved");
      yield* links.report(`${token}x`, "b.mov", "saved");

      const [row] = yield* deliveries.list("dee");
      expect(row?.download).toEqual({ filesSaved: 1, lastAt, startedAt });
      expect((yield* deliveries.list("eve")).length).toBe(0);

      yield* links.report(token, "b.mov", "saved");
      expect((yield* deliveries.view(created.id)).download?.filesSaved).toBe(2);

      // A link that ended takes no more reports.
      yield* TestClock.adjust("4 days");
      yield* links.report(token, "a.mov", "started");
      expect((yield* deliveries.view(created.id)).download?.lastAt).toEqual(lastAt);
    }),
  );

  it.effect("a link without a password opens as before and ignores an unlock", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      const links = yield* SharedLinks;
      const { file, token } = yield* lockedDelivery("open-sam", null);
      const expected = [{ path: "secret/a.mov", size: 3, url: `memory://get/${file.objectKey}` }];
      expect((yield* links.open(token)).files).toEqual(expected);
      expect((yield* links.open(token, "junk")).files).toEqual(expected);
      // Any password "unlocks" it, and the unlock changes nothing.
      const { unlock } = yield* links.unlock(token, "anything", "ip-open");
      expect((yield* links.open(token, unlock)).files).toEqual(expected);
    }),
  );

  it.effect("a password hides the files until the right one is given", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      const links = yield* SharedLinks;
      const { file, token } = yield* lockedDelivery("lock-sam", "correct horse");

      // Neither the title nor any URL leaks; only the sender's name does.
      const locked = yield* Effect.flip(links.open(token));
      expect(locked).toMatchObject({ _tag: "LinkLocked", senderName: "Sam" });
      expect(JSON.stringify(locked)).not.toContain("Secret cut");
      const forged = yield* Effect.flip(links.open(token, "9999999999999.AAAA"));
      expect(forged._tag).toBe("LinkLocked");

      const wrong = yield* Effect.flip(links.unlock(token, "correct hors", "ip-lock"));
      expect(wrong._tag).toBe("WrongPassword");
      const notFound = yield* Effect.flip(links.unlock(`${token}x`, "correct horse", "ip-lock"));
      expect(notFound._tag).toBe("LinkNotFound");

      const { expiresAt, unlock } = yield* links.unlock(token, "correct horse", "ip-lock");
      expect(expiresAt.getTime()).toBe((yield* Clock.currentTimeMillis) + 24 * 3_600_000);
      const shared = yield* links.open(token, unlock);
      expect(shared.title).toBe("Secret cut");
      expect(shared.files).toEqual([
        { path: "secret/a.mov", size: 3, url: `memory://get/${file.objectKey}` },
      ]);
    }),
  );

  it.effect(
    "an unlock expires after a day, opens only its own link and dies with the password",
    () =>
      Effect.gen(function* scenario() {
        yield* TestClock.setTime(Date.now());
        const deliveries = yield* Deliveries;
        const links = yield* SharedLinks;
        const one = yield* lockedDelivery("scope-one", "shared password");
        const two = yield* lockedDelivery("scope-two", "shared password");
        const { unlock } = yield* links.unlock(one.token, "shared password", "ip-scope");

        // Same password, other link.
        expect((yield* Effect.flip(links.open(two.token, unlock)))._tag).toBe("LinkLocked");
        expect((yield* links.open(one.token, unlock)).title).toBe("Secret cut");

        yield* TestClock.adjust("23 hours");
        expect((yield* links.open(one.token, unlock)).title).toBe("Secret cut");
        yield* TestClock.adjust("2 hours");
        expect((yield* Effect.flip(links.open(one.token, unlock)))._tag).toBe("LinkLocked");

        // A new password ends unlocks issued under the old one, even the same text.
        const fresh = yield* links.unlock(one.token, "shared password", "ip-scope");
        expect((yield* links.open(one.token, fresh.unlock)).title).toBe("Secret cut");
        yield* deliveries.setPassword("scope-one", one.created.id, "shared password");
        expect((yield* Effect.flip(links.open(one.token, fresh.unlock)))._tag).toBe("LinkLocked");
        // Removing it opens the link to everyone.
        yield* deliveries.setPassword("scope-one", one.created.id, null);
        expect((yield* links.open(one.token)).title).toBe("Secret cut");
      }),
  );

  it.effect("counts password attempts per link and per IP, right ones too", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      const links = yield* SharedLinks;
      const one = yield* lockedDelivery("rate-one", "the right one");
      const two = yield* lockedDelivery("rate-two", "the right one");
      const three = yield* lockedDelivery("rate-three", "the right one");
      const four = yield* lockedDelivery("rate-four", "the right one");

      // Five attempts on one link from five networks; the sixth is refused
      // even with the right password.
      for (const ip of ["a", "b", "c", "d", "e"]) {
        const wrong = yield* Effect.flip(links.unlock(one.token, "nope nope", `ip-link-${ip}`));
        expect(wrong._tag).toBe("WrongPassword");
      }
      const limited = yield* Effect.flip(links.unlock(one.token, "the right one", "ip-link-f"));
      expect(limited).toMatchObject({
        _tag: "RateLimited",
        limit: "passwordAttemptsPerLink",
        retryAfterSeconds: 60,
      });
      // Another link is untouched.
      yield* links.unlock(two.token, "the right one", "ip-link-g");

      // One network can try ten times across links, then is refused everywhere.
      const attempts = [
        ...Arr.makeBy(4, () => two.token),
        ...Arr.makeBy(5, () => three.token),
        four.token,
      ];
      for (const token of attempts) {
        yield* Effect.flip(links.unlock(token, "nope nope", "ip-busy"));
      }
      const blocked = yield* Effect.flip(links.unlock(four.token, "the right one", "ip-busy"));
      expect(blocked).toMatchObject({ _tag: "RateLimited", limit: "passwordAttemptsPerIp" });
      yield* links.unlock(four.token, "the right one", "ip-calm");
    }),
  );

  it.effect("opening or previewing is not a download, and a locked link takes no reports", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      const deliveries = yield* Deliveries;
      const links = yield* SharedLinks;
      const { created, token } = yield* lockedDelivery("report-sam", "report secret");

      // Without the unlock a report is dropped, like one for a bad token.
      yield* links.report(token, "secret/a.mov", "started");
      yield* links.report(token, "secret/a.mov", "started", "9999999999999.AAAA");
      expect((yield* deliveries.view(created.id)).download).toBeNull();

      const { unlock } = yield* links.unlock(token, "report secret", "ip-report");
      // Opening with it, as the page does to show previews, records nothing.
      yield* links.open(token, unlock);
      yield* links.open(token, unlock);
      expect((yield* deliveries.view(created.id)).download).toBeNull();

      yield* links.report(token, "secret/a.mov", "started", unlock);
      expect((yield* deliveries.view(created.id)).download?.filesSaved).toBe(0);
      const { db } = yield* Database;
      const rows = yield* db.query.download.findMany({ where: { deliveryId: created.id } });
      expect(rows).toHaveLength(1);
    }),
  );
});

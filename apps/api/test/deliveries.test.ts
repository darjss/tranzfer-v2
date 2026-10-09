import { expect, layer, vi } from "@effect/vitest";
import {
  DeliveryId,
  DeliveryNote,
  DeliveryTitle,
  LinkPassword,
  rateLimits,
} from "@tranzfer/contracts";
import { Database, schema } from "@tranzfer/db";
import { eq, sql } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { Base64 } from "effect/encoding";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { Billing, verifyWebhook } from "../src/billing";
import { Deliveries } from "../src/deliveries";
import { Emails, queueOpenings, sendWelcome } from "../src/emails";
import { Mail, MailError } from "../src/infrastructure/email";
import { admitSignup } from "../src/infrastructure/auth";
import {
  createAccessCode,
  listAccessCodes,
  NewAccessCode,
  Plans,
  revokeAccessCode,
} from "../src/plans";
import { SharedLinks } from "../src/shared-links";
import { Transfers } from "../src/transfers";
import { addUser, domainLayer, first, makeMemoryStorage, newDelivery, newFile } from "./support";

const storage = makeMemoryStorage();
const GB = 1_000_000_000;

const subscribe = (userId: string, plan: "pro" | "starter" | "studio") =>
  Effect.flatMap(Effect.service(Database), ({ db }) =>
    db.insert(schema.subscription).values({ plan, status: "active", userId }),
  ).pipe(Effect.orDie);

// A ready delivery of `sizes` for `senderId`, finalized at the current time.
const readyDelivery = (senderId: string, sizes: readonly number[], title = "Cut") =>
  Effect.gen(function* makeReady() {
    const deliveries = yield* Deliveries;
    const transfers = yield* Transfers;
    const created = yield* deliveries.create(
      senderId,
      newDelivery(
        sizes.map((size, index) => newFile(`f${index}.bin`, size)),
        title,
      ),
    );
    for (const file of created.transfers) {
      storage.objects.set(file.objectKey, { etag: "m", size: file.size });
      yield* transfers.finalize(senderId, file.id);
    }
    return yield* deliveries.owned(senderId, created.id);
  });

// Polar's secret is `whsec_` plus the base64 of the HMAC key.
const webhookSecret = (key: string) =>
  Redacted.make(`whsec_${Base64.encode(new TextEncoder().encode(key))}`);

const signed = (rawKey: string, id: string, timestamp: number, body: string) =>
  Effect.promise(async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(rawKey),
      { hash: "SHA-256", name: "HMAC" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${body}`),
    );
    return `v1,${Base64.encode(new Uint8Array(mac))}`;
  });

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
      for (const edit of [{ contentType: "image/png" }, { lastModified: 42 }]) {
        const source = yield* Effect.flip(
          deliveries.create("bob", {
            files: [{ ...first(input.files), ...edit }],
            id: input.id,
            retentionDays: input.retentionDays,
            title: input.title,
          }),
        );
        expect(source._tag).toBe("DeliveryConflict");
      }
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

  it.effect("lets only the owner change the title and note, and the recipient reads them", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("nora", "Nora");
      yield* addUser("oscar");
      const deliveries = yield* Deliveries;
      const links = yield* SharedLinks;
      const created = yield* deliveries.create(
        "nora",
        newDelivery([newFile("cut.mov", 3)], "cut.mov"),
      );
      expect(created.note).toBe("");

      const foreign = yield* Effect.flip(
        deliveries.update("oscar", created.id, { note: "mine now", title: "Stolen" }),
      );
      expect(foreign._tag).toBe("DeliveryNotFound");
      const missing = yield* Effect.flip(
        deliveries.update("nora", DeliveryId.make(crypto.randomUUID()), { note: "", title: "x" }),
      );
      expect(missing._tag).toBe("DeliveryNotFound");
      expect((yield* deliveries.list("nora")).map(({ note, title }) => ({ note, title }))).toEqual([
        { note: "", title: "cut.mov" },
      ]);

      const note = "Final cut.\n<script>alert(1)</script> Colour is locked.";
      const updated = yield* deliveries.update("nora", created.id, { note, title: "Episode 14" });
      expect({ note: updated.note, title: updated.title }).toEqual({ note, title: "Episode 14" });

      // The recipient's page carries the same words once the delivery is ready.
      // Ready far out, so later sweeps in this file leave it alone.
      const { db } = yield* Database;
      yield* db
        .update(schema.delivery)
        .set({ expiresAt: new Date(Date.now() + 30 * 86_400_000), status: "ready" })
        .where(eq(schema.delivery.id, created.id));
      const shared = yield* links.open(created.link.slice("/d/".length));
      expect({ note: shared.note, title: shared.title }).toEqual({ note, title: "Episode 14" });

      // An empty note takes it back off.
      const cleared = yield* deliveries.update("nora", created.id, {
        note: "",
        title: "Episode 14",
      });
      expect(cleared.note).toBe("");
    }),
  );

  it.effect("holds titles to 1 to 200 characters and notes to 500, trimmed", () =>
    Effect.gen(function* scenario() {
      const title = Schema.decodeUnknownEffect(DeliveryTitle);
      const note = Schema.decodeUnknownEffect(DeliveryNote);
      expect(yield* title("  Episode 14  ")).toBe("Episode 14");
      expect(yield* note("   ")).toBe("");
      expect(yield* note("n".repeat(500))).toHaveLength(500);
      expect((yield* Effect.exit(title("   ")))._tag).toBe("Failure");
      expect((yield* Effect.exit(title("t".repeat(201))))._tag).toBe("Failure");
      expect((yield* Effect.exit(note("n".repeat(501))))._tag).toBe("Failure");
    }),
  );

  it.effect("lets only the owner set or remove a link password, and stores only its hash", () =>
    Effect.gen(function* scenario() {
      yield* addUser("pwowner");
      yield* addUser("pwother");
      const deliveries = yield* Deliveries;
      const { db } = yield* Database;
      const created = yield* deliveries.create("pwowner", newDelivery([newFile("a.mov", 3)]));
      expect(created.hasPassword).toBe(false);
      const stored = () =>
        db.query.link
          .findFirst({ columns: { passwordHash: true }, where: { deliveryId: created.id } })
          .pipe(Effect.map((link) => link?.passwordHash));

      const foreign = yield* Effect.flip(
        deliveries.setPassword("pwother", created.id, "hunter2hunter2"),
      );
      expect(foreign._tag).toBe("DeliveryNotFound");
      const missing = yield* Effect.flip(
        deliveries.setPassword("pwowner", DeliveryId.make(crypto.randomUUID()), "hunter2hunter2"),
      );
      expect(missing._tag).toBe("DeliveryNotFound");
      expect(yield* stored()).toBeNull();

      const locked = yield* deliveries.setPassword("pwowner", created.id, "hunter2hunter2");
      expect(locked.hasPassword).toBe(true);
      expect((yield* deliveries.list("pwowner")).map((row) => row.hasPassword)).toEqual([true]);
      // Slow, salted and nothing like the password.
      const hash = yield* stored();
      expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/u);
      expect(hash).not.toContain("hunter2");
      yield* deliveries.setPassword("pwowner", created.id, "hunter2hunter2");
      expect(yield* stored()).not.toBe(hash);

      // A foreign sender can't clear it either.
      yield* Effect.flip(deliveries.setPassword("pwother", created.id, null));
      expect((yield* deliveries.view(created.id)).hasPassword).toBe(true);
      const cleared = yield* deliveries.setPassword("pwowner", created.id, null);
      expect(cleared.hasPassword).toBe(false);
      expect(yield* stored()).toBeNull();
    }),
  );

  it.effect("holds link passwords to 8 to 128 characters", () =>
    Effect.gen(function* scenario() {
      const password = Schema.decodeUnknownEffect(LinkPassword);
      expect(yield* password("with a space ")).toBe("with a space ");
      expect(yield* password("p".repeat(128))).toHaveLength(128);
      expect((yield* Effect.exit(password("short")))._tag).toBe("Failure");
      expect((yield* Effect.exit(password("p".repeat(129))))._tag).toBe("Failure");
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

  it.effect("carries names up to 255 bytes, ASCII or multibyte, and 1,000 files", () =>
    Effect.gen(function* scenario() {
      yield* addUser("dana-names");
      const deliveries = yield* Deliveries;
      const names = ["a".repeat(255), "é".repeat(127), "日".repeat(85), "😀".repeat(63)];
      const created = yield* deliveries.create(
        "dana-names",
        newDelivery(names.map((name) => newFile(`folder/${name}`, 1))),
      );
      expect(created.transfers).toHaveLength(names.length);
    }),
  );

  it.effect("refuses what the disk or the contract can't carry, with the numbers", () =>
    Effect.gen(function* scenario() {
      yield* addUser("erin-refused");
      const deliveries = yield* Deliveries;
      const refusal = (paths: readonly string[]) =>
        Effect.flip(
          deliveries.create("erin-refused", newDelivery(paths.map((path) => newFile(path, 1)))),
        );
      const tooMany = yield* refusal(Array.from({ length: 1001 }, (_, index) => `f/${index}`));
      expect(tooMany).toMatchObject({
        _tag: "DeliveryRefused",
        reason: { _tag: "TooManyFiles", count: 1001, max: 1000 },
      });
      const ascii = yield* refusal(["a".repeat(256)]);
      expect(ascii).toMatchObject({
        reason: { _tag: "NameTooLong", bytes: 256, max: 255 },
      });
      const accents = yield* refusal([`d/${"é".repeat(128)}`]);
      expect(accents).toMatchObject({
        reason: { _tag: "NameTooLong", bytes: 256, max: 255 },
      });
      const emoji = yield* refusal(["😀".repeat(64)]);
      expect(emoji).toMatchObject({
        reason: { _tag: "NameTooLong", bytes: 256, max: 255 },
      });
      const deep = yield* refusal([Array.from({ length: 5 }, () => "d".repeat(250)).join("/")]);
      expect(deep).toMatchObject({
        reason: { _tag: "PathTooLong", bytes: 1254, max: 1024 },
      });
      const unsafe = yield* Effect.all(
        ["a\\b", "../up", "a//b", "tab\tname"].map((path) => refusal([path])),
      );
      expect(unsafe).toMatchObject(
        Array.from({ length: 4 }, () => ({ reason: { _tag: "PathUnsafe" } })),
      );
      const clash = yield* refusal(["Photo.JPG", "photo.jpg"]);
      expect(clash).toMatchObject({ reason: { _tag: "DuplicatePath", path: "photo.jpg" } });
      expect(yield* deliveries.list("erin-refused")).toEqual([]);
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

  it.effect("clears only the sender's ended deliveries off the list, and still purges them", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("ivy");
      const deliveries = yield* Deliveries;
      const { db } = yield* Database;
      const live = yield* deliveries.create("ivy", newDelivery([newFile("live.bin", 1)]));
      const cancelled = yield* deliveries.create("ivy", newDelivery([newFile("gone.bin", 1)]));
      const expired = yield* deliveries.create("ivy", newDelivery([newFile("old.bin", 1)]));
      yield* deliveries.cancel("ivy", cancelled.id);
      yield* db
        .update(schema.delivery)
        .set({ expiresAt: new Date(Date.now() - 60_000), status: "ready" })
        .where(eq(schema.delivery.id, expired.id));

      // Someone else's ids, and a live delivery, are left alone.
      yield* deliveries.clear("alice", [cancelled.id]);
      yield* deliveries.clear("ivy", [live.id, cancelled.id, expired.id]);
      const listed = yield* deliveries.list("ivy");
      expect(listed.map((delivery) => delivery.id)).toEqual([live.id]);

      // Clearing only hides the row: the sweeper still purges what ended.
      yield* TestClock.adjust("20 minutes");
      expect(yield* deliveries.purgeEnded).toBe(2);
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
  it.effect("refuses a delivery past the plan's active space before anything is stored", () =>
    Effect.gen(function* scenario() {
      yield* addUser("iris");
      const deliveries = yield* Deliveries;
      yield* deliveries.create("iris", newDelivery([newFile("a.bin", 15 * GB)]));
      const refused = yield* Effect.flip(
        deliveries.create("iris", newDelivery([newFile("b.bin", 6 * GB)])),
      );
      expect(refused).toMatchObject({
        _tag: "OverPlanLimit",
        limitBytes: 20 * GB,
        plan: "free",
        requestedBytes: 6 * GB,
        usedBytes: 15 * GB,
      });
      expect(yield* deliveries.list("iris")).toHaveLength(1);
      // Exactly the remaining space still fits.
      yield* deliveries.create("iris", newDelivery([newFile("c.bin", 5 * GB)]));
    }),
  );

  it.effect(
    "counts open and unexpired ready deliveries, and frees cancelled and expired ones",
    () =>
      Effect.gen(function* scenario() {
        yield* TestClock.setTime(Date.now());
        yield* addUser("jack");
        const deliveries = yield* Deliveries;
        const { db } = yield* Database;
        const open = yield* deliveries.create("jack", newDelivery([newFile("o.bin", 4 * GB)]));
        const ready = yield* deliveries.create("jack", newDelivery([newFile("r.bin", 3 * GB)]));
        const doomed = yield* deliveries.create("jack", newDelivery([newFile("d.bin", 2 * GB)]));
        yield* db
          .update(schema.delivery)
          .set({ expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), status: "ready" })
          .where(eq(schema.delivery.id, ready.id));
        expect(yield* deliveries.activeBytes("jack")).toBe(9 * GB);

        yield* deliveries.cancel("jack", doomed.id);
        expect(yield* deliveries.activeBytes("jack")).toBe(7 * GB);

        yield* TestClock.adjust("4 days");
        expect(yield* deliveries.activeBytes("jack")).toBe(4 * GB);
        expect((yield* deliveries.view(open.id)).status).toBe("open");
        // Another sender's deliveries never count.
        yield* addUser("kate");
        expect(yield* deliveries.activeBytes("kate")).toBe(0);
      }),
  );

  it.effect("holds link lifetime to the plan, and a subscription raises both limits", () =>
    Effect.gen(function* scenario() {
      yield* addUser("lena");
      const deliveries = yield* Deliveries;
      const tooLong = yield* Effect.flip(
        deliveries.create("lena", newDelivery([newFile("w.bin", 25 * GB)], "Week", 7)),
      );
      expect(tooLong).toMatchObject({
        _tag: "RetentionNotInPlan",
        maxRetentionDays: 3,
        plan: "free",
        requestedDays: 7,
      });

      yield* subscribe("lena", "starter");
      const created = yield* deliveries.create(
        "lena",
        newDelivery([newFile("w2.bin", 25 * GB)], "Week", 7),
      );
      expect(created.retentionDays).toBe(7);
      const tooLongForStarter = yield* Effect.flip(
        deliveries.create("lena", newDelivery([newFile("f.bin", 1)], "Fortnight", 14)),
      );
      expect(tooLongForStarter).toMatchObject({ _tag: "RetentionNotInPlan", plan: "starter" });
    }),
  );

  it.effect("caps new deliveries an hour on Free, with an exact wait, and not on paid plans", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("max");
      yield* addUser("nia");
      yield* subscribe("nia", "pro");
      const deliveries = yield* Deliveries;
      const send = (sender: string) => deliveries.create(sender, newDelivery([newFile("a", 1)]));
      const refusal = send("max").pipe(
        Effect.andThen(Effect.die(new Error("expected the hourly cap"))),
        Effect.catchTag("RateLimited", Effect.succeed),
      );
      yield* Effect.forEach(Arr.range(1, rateLimits.deliveriesPerHour.limit), () =>
        Effect.andThen(send("max"), send("nia")),
      );

      const refused = yield* refusal;
      expect(refused.limit).toBe("deliveriesPerHour");
      expect(refused.retryAfterSeconds).toBeGreaterThan(3500);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(3601);
      yield* send("nia");

      yield* TestClock.adjust(Duration.seconds(refused.retryAfterSeconds - 1));
      yield* refusal;
      yield* TestClock.adjust("1 second");
      yield* send("max");
    }),
  );

  it.effect("caps new deliveries a day on Free, counting the oldest still inside it", () =>
    Effect.gen(function* scenario() {
      const now = Date.now();
      yield* TestClock.setTime(now);
      yield* addUser("olga");
      const deliveries = yield* Deliveries;
      const { db } = yield* Database;
      const { limit } = rateLimits.deliveriesPerDay;
      // One short of the cap, every 12 minutes back from now: few enough in
      // the last hour for the hourly cap, the oldest 19.8 hours ago.
      yield* Effect.forEach(Arr.range(1, limit - 1), (step) =>
        db.insert(schema.delivery).values({
          createdAt: new Date(now - step * 12 * 60 * 1000),
          id: DeliveryId.make(crypto.randomUUID()),
          retentionDays: 3,
          senderId: "olga",
          title: "Earlier",
        }),
      );
      yield* deliveries.create("olga", newDelivery([newFile("last.bin", 1)]));

      const refused = yield* Effect.flip(
        deliveries.create("olga", newDelivery([newFile("over.bin", 1)])),
      );
      expect(refused).toMatchObject({
        _tag: "RateLimited",
        limit: "deliveriesPerDay",
        retryAfterSeconds: (24 * 60 - (limit - 1) * 12) * 60,
      });
    }),
  );

  it.effect("concurrent creates at the hourly cap land only up to it", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("pam");
      const deliveries = yield* Deliveries;
      const { limit } = rateLimits.deliveriesPerHour;
      yield* Effect.forEach(Arr.range(1, limit - 1), () =>
        deliveries.create("pam", newDelivery([newFile("a", 1)])),
      );
      // Every create reads one slot left before any of them inserts.
      const outcomes = yield* Effect.forEach(
        Arr.range(1, 5),
        () =>
          deliveries.create("pam", newDelivery([newFile("a", 1)])).pipe(
            Effect.as("created"),
            Effect.catchTag("RateLimited", (error) => Effect.succeed(error.limit)),
          ),
        { concurrency: "unbounded" },
      );
      expect(outcomes.toSorted()).toEqual([
        "created",
        "deliveriesPerHour",
        "deliveriesPerHour",
        "deliveriesPerHour",
        "deliveriesPerHour",
      ]);
      expect(yield* deliveries.list("pam")).toHaveLength(limit);
    }),
  );

  it.effect("concurrent creates never pass the plan's active space", () =>
    Effect.gen(function* scenario() {
      yield* addUser("quinn");
      yield* subscribe("quinn", "pro");
      const deliveries = yield* Deliveries;
      const outcomes = yield* Effect.forEach(
        Arr.range(1, 3),
        () =>
          deliveries.create("quinn", newDelivery([newFile("half.bin", 400 * GB)])).pipe(
            Effect.as("created"),
            Effect.catchTag("OverPlanLimit", (error) => Effect.succeed(error._tag)),
          ),
        { concurrency: "unbounded" },
      );
      expect(outcomes.toSorted()).toEqual(["OverPlanLimit", "created", "created"]);
      expect(yield* deliveries.activeBytes("quinn")).toBe(800 * GB);
    }),
  );

  it.effect("accepts only a Polar delivery that is signed, fresh and intact", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(1_800_000_000_000);
      const secret = webhookSecret("test webhook key");
      const body = '{"type":"subscription.updated"}';
      const timestamp = 1_800_000_000;
      const good = yield* signed("test webhook key", "evt_1", timestamp, body);
      const headers = {
        "webhook-id": "evt_1",
        "webhook-signature": good,
        "webhook-timestamp": String(timestamp),
      };
      const check = (overrides: Partial<typeof headers>, payload = body, key = secret) =>
        Effect.flip(verifyWebhook(key, { ...headers, ...overrides }, payload));

      yield* verifyWebhook(secret, headers, body);
      // A rotating secret sends several signatures; one match is enough.
      yield* verifyWebhook(secret, { ...headers, "webhook-signature": `v1,AAAA ${good}` }, body);

      expect(yield* check({}, '{"type":"subscription.canceled"}')).toMatchObject({
        reason: "signature",
      });
      expect(yield* check({}, body, webhookSecret("another key"))).toMatchObject({
        reason: "signature",
      });
      expect(yield* check({ "webhook-id": "evt_2" })).toMatchObject({ reason: "signature" });
      expect(yield* check({ "webhook-signature": "v2,abc" })).toMatchObject({
        reason: "signature",
      });
      expect(yield* check({ "webhook-signature": undefined })).toMatchObject({ reason: "headers" });
      expect(yield* check({ "webhook-timestamp": "soon" })).toMatchObject({ reason: "timestamp" });

      // The same signed delivery replayed past the five-minute window.
      yield* TestClock.adjust("6 minutes");
      expect(yield* check({})).toMatchObject({ reason: "timestamp" });
    }),
  );
});

const DAY = 24 * 60 * 60 * 1000;

const addCode = (code: typeof schema.accessCode.$inferInsert) =>
  Effect.flatMap(Effect.service(Database), ({ db }) =>
    db.insert(schema.accessCode).values(code),
  ).pipe(Effect.orDie);

const usesOf = (code: string) =>
  Effect.flatMap(Effect.service(Database), ({ db }) =>
    db.query.accessCode.findFirst({ columns: { uses: true }, where: { code } }),
  ).pipe(Effect.orDie);

layer(domainLayer(storage.layer))("Access codes", (it) => {
  it.effect("a code gives its plan once per user, and every limit follows it", () =>
    Effect.gen(function* scenario() {
      const now = Date.now();
      yield* TestClock.setTime(now);
      yield* addUser("ada");
      yield* addCode({ code: "BETA-PRO", days: 90, maxUses: 30, plan: "pro" });
      const plans = yield* Plans;
      const deliveries = yield* Deliveries;

      // Typed in any case, with stray spaces.
      const grant = yield* plans.redeem("ada", "  beta-pro ");
      expect(grant).toEqual({ endsAt: new Date(now + 90 * DAY), plan: "pro" });
      expect(yield* plans.current("ada")).toEqual({ grantEndsAt: grant.endsAt, plan: "pro" });
      // Pro's retention and space, with no subscription anywhere.
      const created = yield* deliveries.create(
        "ada",
        newDelivery([newFile("big.bin", 500 * GB)], "Fortnight", 14),
      );
      expect(created.retentionDays).toBe(14);

      expect(yield* Effect.flip(plans.redeem("ada", "BETA-PRO"))).toMatchObject({
        _tag: "AccessCodeRefused",
        reason: "alreadyRedeemed",
      });
      expect(yield* usesOf("BETA-PRO")).toEqual({ uses: 1 });

      // The grant ends on its day and the plan falls back to Free.
      yield* TestClock.adjust(Duration.days(90));
      expect(yield* plans.current("ada")).toEqual({ grantEndsAt: null, plan: "free" });
    }),
  );

  it.effect("refuses an unknown, expired or used up code without using it", () =>
    Effect.gen(function* scenario() {
      const now = Date.now();
      yield* TestClock.setTime(now);
      yield* addUser("bo");
      yield* addUser("cy");
      yield* addCode({
        code: "OLD",
        days: 30,
        expiresAt: new Date(now),
        maxUses: 5,
        plan: "pro",
      });
      yield* addCode({ code: "ONE", days: 30, maxUses: 1, plan: "starter" });
      const plans = yield* Plans;
      const reason = (userId: string, code: string) =>
        Effect.map(Effect.flip(plans.redeem(userId, code)), (error) =>
          error._tag === "AccessCodeRefused" ? error.reason : error._tag,
        );

      expect(yield* reason("bo", "NOPE")).toBe("unknown");
      expect(yield* reason("bo", "OLD")).toBe("expired");
      yield* plans.redeem("bo", "ONE");
      expect(yield* reason("cy", "ONE")).toBe("usedUp");
      expect(yield* usesOf("OLD")).toEqual({ uses: 0 });
      expect(yield* usesOf("ONE")).toEqual({ uses: 1 });
      expect(yield* plans.current("cy")).toEqual({ grantEndsAt: null, plan: "free" });
    }),
  );

  it.effect("concurrent redemptions never pass the code's uses", () =>
    Effect.gen(function* scenario() {
      const users = ["d1", "d2", "d3", "d4", "d5", "d6"];
      yield* Effect.forEach(users, (id) => addUser(id));
      yield* addCode({ code: "RUSH", days: 7, maxUses: 2, plan: "studio" });
      const plans = yield* Plans;
      // Every attempt reads the code with uses to spare before any batch lands.
      const outcomes = yield* Effect.forEach(
        users,
        (id) =>
          plans.redeem(id, "RUSH").pipe(
            Effect.as("granted"),
            Effect.catchTag("AccessCodeRefused", (error) => Effect.succeed(error.reason)),
          ),
        { concurrency: "unbounded" },
      );
      expect(outcomes.toSorted()).toEqual([
        "granted",
        "granted",
        "usedUp",
        "usedUp",
        "usedUp",
        "usedUp",
      ]);
      expect(yield* usesOf("RUSH")).toEqual({ uses: 2 });
    }),
  );

  it.effect("the higher of a subscription and a grant sets the plan", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("eve");
      yield* addUser("fay");
      yield* subscribe("eve", "studio");
      yield* subscribe("fay", "starter");
      yield* addCode({ code: "PRO-30", days: 30, maxUses: 10, plan: "pro" });
      const plans = yield* Plans;
      yield* plans.redeem("eve", "PRO-30");
      yield* plans.redeem("fay", "PRO-30");
      expect(yield* plans.current("eve")).toEqual({ grantEndsAt: null, plan: "studio" });
      expect(yield* plans.current("fay")).toMatchObject({ plan: "pro" });
      yield* TestClock.adjust(Duration.days(30));
      expect(yield* plans.current("fay")).toEqual({ grantEndsAt: null, plan: "starter" });
    }),
  );

  it.effect("caps code attempts per user, so codes can't be guessed", () =>
    Effect.gen(function* scenario() {
      yield* addUser("gus");
      const plans = yield* Plans;
      const tries = yield* Effect.forEach(Arr.range(1, rateLimits.codeRedemptions.limit + 1), (n) =>
        Effect.map(Effect.flip(plans.redeem("gus", `GUESS-${n}`)), (error) => error._tag),
      );
      expect(tries.at(-1)).toBe("RateLimited");
      expect(tries.slice(0, -1)).toEqual(
        Arr.makeBy(rateLimits.codeRedemptions.limit, () => "AccessCodeRefused"),
      );
    }),
  );

  it.effect("a code revoked while a redemption is in flight grants nothing", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("hal");
      yield* addCode({ code: "LATE", days: 30, maxUses: 10, plan: "pro" });
      // The operator's revoke lands after the redemption read the code and
      // before its batch runs.
      const revokingFirst = Layer.effect(
        Database,
        Effect.map(Effect.service(Database), (database) =>
          Database.of({
            ...database,
            batch: (queries) =>
              revokeAccessCode("LATE").pipe(
                Effect.orDie,
                Effect.provideService(Database, database),
                Effect.andThen(database.batch(queries)),
              ),
          }),
        ),
      );
      const refused = yield* Effect.flip(
        Effect.flatMap(Effect.service(Plans), (plans) => plans.redeem("hal", "LATE")).pipe(
          Effect.provide(
            Plans.layer(() => Effect.succeed(true)).pipe(Layer.provide(revokingFirst)),
          ),
        ),
      );
      expect(refused).toMatchObject({ _tag: "AccessCodeRefused", reason: "expired" });
      expect(yield* usesOf("LATE")).toEqual({ uses: 0 });
      expect(yield* (yield* Plans).current("hal")).toEqual({ grantEndsAt: null, plan: "free" });
    }),
  );

  it.effect("operators create, list and revoke codes", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("ivy");
      const input = yield* Schema.decodeUnknownEffect(NewAccessCode)({
        code: " beta-studio ",
        days: 60,
        lastDay: "2099-12-31",
        maxUses: 3,
        plan: "studio",
      });
      const created = yield* createAccessCode(input);
      expect(created).toMatchObject({
        code: "BETA-STUDIO",
        days: 60,
        expiresAt: new Date("2100-01-01T00:00:00Z"),
        maxUses: 3,
        uses: 0,
      });
      expect(yield* Effect.flip(createAccessCode(input))).toMatchObject({
        _tag: "AccessCodeExists",
      });
      yield* (yield* Plans).redeem("ivy", "beta-studio");
      expect(yield* listAccessCodes()).toContainEqual(
        expect.objectContaining({ code: "BETA-STUDIO", uses: 1 }),
      );

      yield* revokeAccessCode("beta-studio");
      yield* addUser("jo");
      expect(yield* Effect.flip((yield* Plans).redeem("jo", "BETA-STUDIO"))).toMatchObject({
        reason: "expired",
      });
      expect(yield* Effect.flip(revokeAccessCode("BETA-STUDIO"))).toMatchObject({
        _tag: "AccessCodeNotLive",
      });
      expect(yield* Effect.flip(revokeAccessCode("NOPE"))).toMatchObject({
        _tag: "AccessCodeNotLive",
      });
      // Grants already made keep their end.
      expect(yield* (yield* Plans).current("ivy")).toMatchObject({ plan: "studio" });
    }),
  );

  it.effect("refuses a code with a day that doesn't exist or a grant past ten years", () =>
    Effect.gen(function* scenario() {
      const valid = { code: "BETA-PRO", days: 90, maxUses: 30, plan: "pro" };
      const decode = (input: Partial<typeof NewAccessCode.Encoded>) =>
        Schema.decodeUnknownEffect(NewAccessCode)({ ...valid, ...input }).pipe(
          Effect.match({ onFailure: () => "refused", onSuccess: () => "accepted" }),
        );
      expect(yield* decode({})).toBe("accepted");
      expect(yield* decode({ lastDay: "2028-02-29" })).toBe("accepted");
      expect(yield* decode({ lastDay: "2026-02-30" })).toBe("refused");
      expect(yield* decode({ lastDay: "2026-13-01" })).toBe("refused");
      expect(yield* decode({ lastDay: "2026-12-31T00:00:00Z" })).toBe("refused");
      expect(yield* decode({ days: 100_000_000_000 })).toBe("refused");
      expect(yield* decode({ days: 0 })).toBe("refused");
      expect(yield* decode({ days: 1.5 })).toBe("refused");
      expect(yield* decode({ maxUses: 0 })).toBe("refused");
      expect(yield* decode({ code: "no spaces" })).toBe("refused");
    }),
  );
});

layer(domainLayer(storage.layer))("Accounts", (it) => {
  it.effect("concurrent sign-ups from one IP never pass the new-accounts cap", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      const { limit } = rateLimits.newAccounts;
      // Every attempt counts the IP's sign-ups before any of them inserts.
      const outcomes = yield* Effect.forEach(
        Arr.range(1, limit + 3),
        () =>
          admitSignup("203.0.113.7").pipe(
            Effect.as("admitted"),
            Effect.catchTag("RateLimited", (error) => Effect.succeed(error.limit)),
          ),
        { concurrency: "unbounded" },
      );
      expect(outcomes.filter((outcome) => outcome === "admitted")).toHaveLength(limit);
      expect(outcomes.filter((outcome) => outcome === "newAccounts")).toHaveLength(3);
      // Another IP has its own count.
      yield* admitSignup("203.0.113.8");

      const refused = yield* Effect.flip(admitSignup("203.0.113.7"));
      expect(refused.retryAfterSeconds).toBeGreaterThan(rateLimits.newAccounts.windowSeconds - 60);
      yield* TestClock.adjust(Duration.seconds(refused.retryAfterSeconds));
      yield* admitSignup("203.0.113.7");
    }),
  );
});

// Polar, faked at fetch: the subscriptions it lists for the customer.
let polarSubscriptions: readonly {
  readonly cancel_at_period_end?: boolean;
  readonly current_period_end: string;
  readonly product_id: string;
  readonly status: string;
}[] = [];
const polarCalls: string[] = [];

const billingLayer = Billing.layer({
  appUrl: "https://app.test",
  polar: Option.some({
    access: { apiBaseUrl: "https://sandbox-api.polar.sh", apiKey: Redacted.make("token") },
    products: Effect.succeed({ pro: "prod_pro", starter: "prod_starter", studio: "prod_studio" }),
    reconcileOnRead: false,
    webhookSecret: Effect.succeed(webhookSecret("billing webhook key")),
  }),
}).pipe(Layer.provideMerge(domainLayer(storage.layer)));

const polarPage = () =>
  Response.json({
    items: polarSubscriptions.map((subscription) => ({
      ...subscription,
      customer_id: "cus_1",
      id: "sub_1",
    })),
    pagination: { max_page: 1, total_count: polarSubscriptions.length },
  });

const asPolar = (subscriptions: typeof polarSubscriptions) => {
  polarSubscriptions = subscriptions;
  vi.stubGlobal("fetch", async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    await request.arrayBuffer();
    polarCalls.push(request.url);
    return polarPage();
  });
};
const reconcileAs = (userId: string) =>
  Effect.gen(function* reconcileUser() {
    const billing = yield* Billing;
    const body = JSON.stringify({ data: { customer: { external_id: userId } } });
    const timestamp = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    const header = yield* signed("billing webhook key", "evt", timestamp, body);
    yield* billing.webhook(
      {
        "webhook-id": "evt",
        "webhook-signature": header,
        "webhook-timestamp": String(timestamp),
      },
      body,
    );
    return yield* billing.summary(userId);
  });
const later = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

layer(billingLayer)("Billing reconcile", (it) => {
  it.effect("keeps a paid plan while payment is past due and until a cancelled period ends", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("mona");
      asPolar([{ current_period_end: later(2), product_id: "prod_pro", status: "past_due" }]);
      expect(yield* reconcileAs("mona")).toMatchObject({ plan: "pro", status: "past_due" });

      asPolar([{ current_period_end: later(2), product_id: "prod_pro", status: "canceled" }]);
      expect(yield* reconcileAs("mona")).toMatchObject({ plan: "pro", status: "canceled" });

      asPolar([{ current_period_end: later(-1), product_id: "prod_pro", status: "canceled" }]);
      expect(yield* reconcileAs("mona")).toMatchObject({ plan: "free", status: "none" });

      asPolar([{ current_period_end: later(9), product_id: "prod_pro", status: "unpaid" }]);
      expect(yield* reconcileAs("mona")).toMatchObject({ plan: "free", status: "none" });

      // The highest granting plan wins when a customer holds two.
      asPolar([
        { current_period_end: later(9), product_id: "prod_starter", status: "active" },
        { current_period_end: later(9), product_id: "prod_studio", status: "trialing" },
      ]);
      expect(yield* reconcileAs("mona")).toMatchObject({ plan: "studio", status: "trialing" });
    }),
  );

  it.effect("the sweep reconciles rows past their period end, a few at a time", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.now());
      yield* addUser("nina");
      yield* addUser("omar");
      yield* addUser("comp");
      const billing = yield* Billing;
      const { db } = yield* Database;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const row = {
        currentPeriodEnd: hourAgo,
        plan: "pro",
        status: "active",
        updatedAt: hourAgo,
      } as const;
      yield* db.insert(schema.subscription).values([
        { ...row, userId: "nina" },
        // Still inside its period: left alone.
        { ...row, currentPeriodEnd: new Date(Date.now() + 86_400_000), userId: "omar" },
        // A grant has no period and Polar never owns it.
        { plan: "studio", status: "comp", userId: "comp" },
      ]);
      // Polar says the subscription ended, which a lost webhook never told us.
      asPolar([]);
      polarCalls.length = 0;
      expect(yield* billing.reconcileStale).toBe(1);
      expect(polarCalls).toHaveLength(1);
      expect(yield* billing.summary("nina")).toMatchObject({ plan: "free", status: "none" });
      expect(yield* billing.summary("omar")).toMatchObject({ plan: "pro" });
      expect(yield* billing.summary("comp")).toMatchObject({ plan: "studio", status: "comp" });
      expect(yield* billing.reconcileStale).toBe(0);
      // A webhook for a comp user cannot take the grant away.
      expect(yield* reconcileAs("comp")).toMatchObject({ plan: "studio", status: "comp" });
    }),
  );
});

const closedBilling = Billing.layer({ appUrl: "https://app.test", polar: Option.none() }).pipe(
  Layer.provideMerge(domainLayer(storage.layer)),
);

layer(closedBilling)("Billing before paid plans open", (it) => {
  it.effect("refuses checkout, the portal and webhooks without calling Polar", () =>
    Effect.gen(function* scenario() {
      yield* addUser("pia");
      const billing = yield* Billing;
      const pia = { email: "pia@test", id: "pia", image: null, name: "Pia" };
      asPolar([]);
      polarCalls.length = 0;
      expect(yield* Effect.flip(billing.checkout(pia, "pro"))).toMatchObject({
        reason: "notOpen",
      });
      expect(yield* Effect.flip(billing.portal("pia"))).toMatchObject({ reason: "notOpen" });
      expect(yield* Effect.flip(billing.webhook({}, "{}"))).toMatchObject({
        reason: "disabled",
      });
      expect(yield* billing.summary("pia")).toMatchObject({ plan: "free", status: "none" });

      // A code still works, and the summary says until when.
      yield* addCode({ code: "BETA-STUDIO", days: 14, maxUses: 1, plan: "studio" });
      const grant = yield* (yield* Plans).redeem("pia", "beta-studio");
      expect(yield* billing.summary("pia")).toMatchObject({
        grantEndsAt: grant.endsAt,
        limitBytes: 3000 * GB,
        maxRetentionDays: 14,
        plan: "studio",
        status: "none",
      });
      expect(polarCalls).toEqual([]);
    }),
  );
});

// Email as a list of what went out. Addresses in `bouncing` fail the way the
// send binding fails for a suppressed recipient, and `holding` ones are kept
// back the way a staging allowlist keeps them.
const sent: { readonly to: string; readonly subject: string }[] = [];
const mailed: Parameters<Mail["Service"]["send"]>[0][] = [];
const bouncing = new Set<string>();
const holding = new Set<string>();
const memoryMail = Layer.succeed(
  Mail,
  Mail.of({
    send: (message) => {
      if (bouncing.has(message.to)) {
        return Effect.fail(new MailError({ code: "E_RECIPIENT_SUPPRESSED" }));
      }
      if (holding.has(message.to)) {
        return Effect.succeed("held" as const);
      }
      return Effect.sync(() => {
        sent.push({ subject: message.subject, to: message.to });
        mailed.push(message);
        return "sent" as const;
      });
    },
  }),
);
// Counts per key and never resets, like the other fake limiters here.
const counts = new Map<string, number>();
const underLimit = (limit: number) => (key: string) =>
  Effect.sync(() => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count <= limit;
  });
// Background work waits here until a test runs it, as waitUntil runs it after the response.
const background: Effect.Effect<void>[] = [];
const emailsLayer = Emails.layer({
  allowDeliveryEmail: underLimit(rateLimits.emailRequests.limit),
  allowInterest: underLimit(rateLimits.interestSignups.limit),
  appUrl: "https://app.test",
  background: (effect) =>
    Effect.sync(() => {
      background.push(effect);
    }),
}).pipe(Layer.provideMerge(memoryMail), Layer.provideMerge(domainLayer(storage.layer)));

const interestRows = Effect.flatMap(Effect.service(Database), ({ db }) =>
  db.query.planInterest.findMany({ orderBy: { id: "asc" } }),
).pipe(Effect.orDie);

layer(emailsLayer)("Emails", (it) => {
  it.effect("keeps one row per address and plan, and confirms only the first ask", () =>
    Effect.gen(function* scenario() {
      yield* addUser("kai");
      const emails = yield* Emails;
      sent.length = 0;
      expect(
        yield* emails.joinInterest(
          { email: "Ana@Example.com", plan: "pro", userId: null },
          "1.1.1.1",
        ),
      ).toEqual({ email: "ana@example.com" });
      yield* emails.joinInterest(
        { email: "ana@example.com", plan: "pro", userId: null },
        "1.1.1.1",
      );
      yield* emails.joinInterest(
        { email: "ana@example.com", plan: "studio", userId: null },
        "1.1.1.1",
      );
      yield* emails.joinInterest({ email: "kai@test", plan: "pro", userId: "kai" }, "1.1.1.2");
      expect(
        (yield* interestRows).map(({ email, plan, userId }) => ({ email, plan, userId })),
      ).toEqual([
        { email: "ana@example.com", plan: "pro", userId: null },
        { email: "ana@example.com", plan: "studio", userId: null },
        { email: "kai@test", plan: "pro", userId: "kai" },
      ]);
      expect(sent).toEqual([
        { subject: "You're on the list for Pro", to: "ana@example.com" },
        { subject: "You're on the list for Studio", to: "ana@example.com" },
        { subject: "You're on the list for Pro", to: "kai@test" },
      ]);
    }),
  );

  it.effect("keeps a sign-up whose confirmation bounced", () =>
    Effect.gen(function* scenario() {
      bouncing.add("gone@example.com");
      const emails = yield* Emails;
      expect(
        yield* emails.joinInterest(
          { email: "gone@example.com", plan: "starter", userId: null },
          "2.2.2.2",
        ),
      ).toEqual({ email: "gone@example.com" });
      expect((yield* interestRows).filter((row) => row.email === "gone@example.com")).toHaveLength(
        1,
      );
    }),
  );

  it.effect("holds interest sign-ups to the per-IP rate, and other IPs not at all", () =>
    Effect.gen(function* scenario() {
      const emails = yield* Emails;
      const { limit, windowSeconds } = rateLimits.interestSignups;
      yield* Effect.forEach(Arr.range(1, limit), (n) =>
        emails.joinInterest({ email: `n${n}@example.com`, plan: "pro", userId: null }, "3.3.3.3"),
      );
      expect(
        yield* Effect.flip(
          emails.joinInterest({ email: "late@example.com", plan: "pro", userId: null }, "3.3.3.3"),
        ),
      ).toMatchObject({
        _tag: "RateLimited",
        limit: "interestSignups",
        retryAfterSeconds: windowSeconds,
      });
      expect(
        yield* emails.joinInterest(
          { email: "late@example.com", plan: "pro", userId: null },
          "4.4.4.4",
        ),
      ).toEqual({ email: "late@example.com" });
    }),
  );

  it.effect("a failed welcome send never fails the sign-up that triggered it", () =>
    Effect.gen(function* scenario() {
      sent.length = 0;
      bouncing.add("bounce@example.com");
      yield* sendWelcome("bounce@example.com", "https://app.test");
      yield* sendWelcome("new@example.com", "https://app.test");
      expect(sent).toEqual([{ subject: "Your Tranzfer account is ready", to: "new@example.com" }]);
    }),
  );

  it.effect("sends the opening email once to queued rows, and unqueues a failed send", () =>
    Effect.gen(function* scenario() {
      const emails = yield* Emails;
      yield* emails.joinInterest(
        { email: "o1@example.com", plan: "studio", userId: null },
        "5.5.5.5",
      );
      yield* emails.joinInterest(
        { email: "o2@example.com", plan: "studio", userId: null },
        "5.5.5.5",
      );
      bouncing.add("o2@example.com");
      // Nothing is queued yet, so nothing goes out, and a dry run only counts.
      expect(yield* emails.sendOpenings).toBe(0);
      expect(yield* queueOpenings("studio", { dryRun: true })).toEqual({ queued: 0, waiting: 3 });
      expect(yield* emails.sendOpenings).toBe(0);
      expect(yield* queueOpenings("studio", { dryRun: false })).toEqual({ queued: 3, waiting: 3 });
      sent.length = 0;
      const studioRows = Effect.map(interestRows, (rows) =>
        rows
          .filter((row) => row.plan === "studio")
          .map(({ email, notifiedAt, notifyQueuedAt }) => ({
            email,
            notified: notifiedAt !== null,
            queued: notifyQueuedAt !== null,
          })),
      );
      expect(yield* emails.sendOpenings).toBe(3);
      expect(sent).toEqual([
        { subject: "Studio is open", to: "ana@example.com" },
        { subject: "Studio is open", to: "o1@example.com" },
      ]);
      expect(yield* studioRows).toEqual([
        { email: "ana@example.com", notified: true, queued: true },
        { email: "o1@example.com", notified: true, queued: true },
        { email: "o2@example.com", notified: false, queued: false },
      ]);
      // A second sweep sends nothing; queueing again retries only the failure.
      expect(yield* emails.sendOpenings).toBe(0);
      bouncing.delete("o2@example.com");
      expect(yield* queueOpenings("studio", { dryRun: false })).toEqual({ queued: 1, waiting: 1 });
      expect(yield* emails.sendOpenings).toBe(1);
      expect(sent.at(-1)).toEqual({ subject: "Studio is open", to: "o2@example.com" });
    }),
  );

  const runBackground = Effect.suspend(() => Effect.all(background.splice(0)));

  it.effect("emails each distinct address in the background and reports how each one ended", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.parse("2026-10-09T09:00:00Z"));
      yield* addUser("ema", "Ema <b>Ross");
      const emails = yield* Emails;
      const deliveries = yield* Deliveries;
      const created = yield* readyDelivery("ema", [1_500_000, 2_000_000], 'Cut <3 "final"');
      const ready = yield* deliveries.update("ema", created.id, {
        note: "Hello & bye\nSecond line <b>bold</b>",
        title: created.title,
      });
      bouncing.add("gone@example.com");
      holding.add("held@example.com");
      mailed.length = 0;

      const queued = yield* emails.sendDelivery(
        { email: "ema@test", id: "ema", name: "Ema <b>Ross" },
        {
          deliveryId: ready.id,
          recipients: ["A@Example.com", "gone@example.com", "held@example.com", "a@example.com"],
        },
      );
      // Off the request path: the answer comes back before anything is sent.
      expect(queued.map(({ errorCode, status }) => ({ errorCode, status }))).toEqual([
        { errorCode: null, status: "queued" },
        { errorCode: null, status: "queued" },
        { errorCode: null, status: "queued" },
      ]);
      expect(mailed).toEqual([]);

      yield* runBackground;
      const settled = yield* emails.deliveryEmails("ema", ready.id);
      expect(
        settled.toReversed().map(({ errorCode, id, status }) => ({ errorCode, id, status })),
      ).toEqual([
        { errorCode: null, id: queued[0]?.id, status: "sent" },
        { errorCode: "E_RECIPIENT_SUPPRESSED", id: queued[1]?.id, status: "failed" },
        { errorCode: "held", id: queued[2]?.id, status: "failed" },
      ]);

      expect(mailed).toHaveLength(1);
      const { html, ...envelope } = first(mailed);
      const url = `https://app.test${ready.link}`;
      expect(envelope).toEqual({
        replyTo: "ema@test",
        subject: 'Ema <b>Ross sent you Cut <3 "final"',
        text: [
          "Hi,",
          'Ema <b>Ross sent you Cut <3 "final" on Tranzfer.',
          "Ema <b>Ross wrote:\nHello & bye\nSecond line <b>bold</b>",
          "2 files, 3.5 MB. The link works until 12 October 2026 at 09:00 UTC.",
          `Download: ${url}`,
          "You don't need an account. Reply to this email to write to Ema <b>Ross.",
          "Tranzfer",
        ].join("\n\n"),
        to: "a@example.com",
      });
      // Names, titles and notes are text in the HTML, and the download link is its only link.
      expect(html).toContain(
        "Ema &lt;b&gt;Ross wrote:<br>Hello &amp; bye<br>Second line &lt;b&gt;bold&lt;/b&gt;",
      );
      expect(html).toContain("Cut &lt;3 &quot;final&quot;");
      expect(html).not.toContain("<b>");
      expect(html.match(/<a /gu)).toHaveLength(1);
      expect(html).toContain(`<a href="${url}"`);
      expect(html).not.toContain("<img");
    }),
  );

  it.effect("emails only the owner's ready, unexpired deliveries", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.parse("2026-10-09T09:00:00Z"));
      yield* addUser("own");
      yield* addUser("other");
      const emails = yield* Emails;
      const deliveries = yield* Deliveries;
      const to = { recipients: ["a@example.com"] };
      const owner = { email: "own@test", id: "own", name: "Own" };

      const ready = yield* readyDelivery("own", [3]);
      expect(
        yield* Effect.flip(
          emails.sendDelivery({ ...owner, id: "other" }, { ...to, deliveryId: ready.id }),
        ),
      ).toMatchObject({ _tag: "DeliveryNotFound" });
      expect(yield* emails.deliveryEmails("other", ready.id)).toEqual([]);

      const open = yield* deliveries.create("own", newDelivery([newFile("x", 1)], "Still going"));
      expect(
        yield* Effect.flip(emails.sendDelivery(owner, { ...to, deliveryId: open.id })),
      ).toMatchObject({ _tag: "DeliveryNotShareable" });

      const cancelled = yield* readyDelivery("own", [3], "Cancelled");
      yield* deliveries.cancel("own", cancelled.id);
      expect(
        yield* Effect.flip(emails.sendDelivery(owner, { ...to, deliveryId: cancelled.id })),
      ).toMatchObject({ _tag: "DeliveryNotShareable" });

      yield* TestClock.adjust("4 days");
      expect(
        yield* Effect.flip(emails.sendDelivery(owner, { ...to, deliveryId: ready.id })),
      ).toMatchObject({ _tag: "DeliveryNotShareable" });
      expect(background).toEqual([]);
    }),
  );

  it.effect("holds a sender to the request rate and the daily caps, then reopens", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.parse("2028-03-01T09:00:00Z"));
      yield* addUser("cap");
      const emails = yield* Emails;
      const ready = yield* readyDelivery("cap", [3]);
      const sender = { email: "cap@test", id: "cap", name: "Cap" };
      const many = (prefix: string, count: number) => ({
        deliveryId: ready.id,
        recipients: Arr.range(1, count).map((n) => `${prefix}${n}@example.com`),
      });

      // 50 a day for one sender: five sends of ten.
      for (const round of Arr.range(1, 5)) {
        yield* emails.sendDelivery(sender, many(`r${round}-`, 10));
      }
      expect(yield* Effect.flip(emails.sendDelivery(sender, many("late-", 1)))).toMatchObject({
        _tag: "RateLimited",
        limit: "emailsPerDay",
        retryAfterSeconds: rateLimits.emailsPerDay.windowSeconds,
      });
      // Nothing was queued by the refused send.
      expect(yield* emails.deliveryEmails("cap", ready.id)).toHaveLength(50);
      yield* TestClock.adjust("1 day");
      expect(yield* emails.sendDelivery(sender, many("again-", 1))).toHaveLength(1);

      // Each sender gets a request budget of their own.
      for (const _ of Arr.range(1, rateLimits.emailRequests.limit - 7)) {
        yield* emails.sendDelivery(sender, many("x-", 1));
      }
      expect(yield* Effect.flip(emails.sendDelivery(sender, many("y-", 1)))).toMatchObject({
        _tag: "RateLimited",
        limit: "emailRequests",
        retryAfterSeconds: rateLimits.emailRequests.windowSeconds,
      });
      background.length = 0;
    }),
  );

  it.effect("keeps every sender together under the account's daily quota", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.parse("2031-03-01T09:00:00Z"));
      yield* addUser("wide");
      yield* addUser("bulk");
      const { db } = yield* Database;
      const emails = yield* Emails;
      const ready = yield* readyDelivery("wide", [3]);
      const bulk = yield* readyDelivery("bulk", [3]);
      const { emailsAccountPerDay } = rateLimits;
      // Everyone else's sends so far today, short of the cap by five.
      yield* db
        .run(
          sql`insert into delivery_email (delivery_id, status, created_at) select ${bulk.id}, 'sent', ${Date.parse("2031-03-01T09:00:00Z")} from json_each(${JSON.stringify(Arr.range(1, emailsAccountPerDay.limit - 5))})`,
        )
        .pipe(Effect.orDie);
      const sender = { email: "wide@test", id: "wide", name: "Wide" };
      const many = (count: number) => ({
        deliveryId: ready.id,
        recipients: Arr.range(1, count).map((n) => `w${n}@example.com`),
      });
      expect(yield* Effect.flip(emails.sendDelivery(sender, many(6)))).toMatchObject({
        _tag: "RateLimited",
        limit: "emailsAccountPerDay",
      });
      expect(yield* emails.sendDelivery(sender, many(5))).toHaveLength(5);
      background.length = 0;
    }),
  );

  it.effect("marks a send that never finished as failed once it is clearly lost", () =>
    Effect.gen(function* scenario() {
      yield* TestClock.setTime(Date.parse("2032-03-01T09:00:00Z"));
      yield* addUser("lost");
      const emails = yield* Emails;
      const ready = yield* readyDelivery("lost", [3]);
      // Earlier tests left their sends queued; settle those first.
      yield* emails.failLost;
      yield* emails.sendDelivery(
        { email: "lost@test", id: "lost", name: "Lost" },
        { deliveryId: ready.id, recipients: ["a@example.com"] },
      );
      background.length = 0;
      yield* TestClock.adjust("9 minutes");
      expect(yield* emails.failLost).toBe(0);
      yield* TestClock.adjust("2 minutes");
      expect(yield* emails.failLost).toBe(1);
      expect(
        (yield* emails.deliveryEmails("lost", ready.id)).map(({ errorCode, status }) => ({
          errorCode,
          status,
        })),
      ).toEqual([{ errorCode: "lost", status: "failed" }]);
    }),
  );
});

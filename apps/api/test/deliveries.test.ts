import { expect, layer, vi } from "@effect/vitest";
import { DeliveryId, rateLimits } from "@tranzfer/contracts";
import { Database, schema } from "@tranzfer/db";
import { eq } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { Base64 } from "effect/encoding";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";

import { Billing, verifyWebhook } from "../src/billing";
import { Deliveries } from "../src/deliveries";
import { addUser, domainLayer, first, makeMemoryStorage, newDelivery, newFile } from "./support";

const storage = makeMemoryStorage();
const GB = 1_000_000_000;

const subscribe = (userId: string, plan: "pro" | "starter") =>
  Effect.flatMap(Effect.service(Database), ({ db }) =>
    db.insert(schema.subscription).values({ plan, status: "active", userId }),
  ).pipe(Effect.orDie);

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

// Polar, faked at fetch: the subscriptions it lists for the customer.
let polarSubscriptions: readonly {
  readonly cancel_at_period_end?: boolean;
  readonly current_period_end: string;
  readonly product_id: string;
  readonly status: string;
}[] = [];
const polarCalls: string[] = [];

const billingLayer = Billing.layer({
  access: { apiBaseUrl: "https://sandbox-api.polar.sh", apiKey: Redacted.make("token") },
  appUrl: "https://app.test",
  products: Effect.succeed({ pro: "prod_pro", starter: "prod_starter", studio: "prod_studio" }),
  reconcileOnRead: false,
  webhookSecret: Effect.succeed(webhookSecret("billing webhook key")),
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

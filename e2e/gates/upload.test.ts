import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { expect } from "@effect/vitest";
import type { DeliveryId } from "@tranzfer/contracts";
import { partCount, partSize } from "@tranzfer/contracts";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import type { Locator, Page } from "playwright";

import { Browser } from "../src/browser";
import { ackedParts, Ledger, summarize } from "../src/ledger";
import { NetControl } from "../src/net";
import { Run, scenario } from "../src/scenario";
import { mountSynthFile, sha256File } from "../src/synthfile";
import { Target } from "../src/target";
import { gates, parseSize } from "./gates";

const gateEnv = process.env.GATE;
const gateEntry = Object.entries(gates).find(([name]) => name === gateEnv);
if (gateEntry === undefined) {
  throw new Error("GATE is required (internal | beta | promise)");
}
const [gateName, gate] = gateEntry;
const sizeOverride = process.env.GATE_SIZE;
const size = sizeOverride === undefined ? parseSize(gate.size) : parseSize(sizeOverride);
const totalParts = partCount(size);
const partBytes = partSize(size);

const MIB = 1024 * 1024;

// Retry signals for the polling flatMaps below; tagged so the error channel stays typed.
class Pending extends Data.TaggedError("Pending")<{ readonly message: string }> {}
const TRAP_LIMIT = Duration.toMillis("10 minutes");

// A planned trap that never fires fails the gate instead of hanging the run.
const awaitFired = <A>(fired: Deferred.Deferred<A>, trap: string) =>
  Deferred.await(fired).pipe(
    Effect.timeout(TRAP_LIMIT),
    Effect.catchTag("TimeoutError", () => Effect.die(new Error(`${trap} fault never fired`))),
  );

const mibPerSecond = (bytes: number, seconds: number) =>
  `${(bytes / seconds / MIB).toFixed(1)} MiB/s`;

const waitVisible = (
  locator: { waitFor: (options?: { state: "visible"; timeout: number }) => Promise<void> },
  timeout = 120_000,
) =>
  Effect.promise(async () => {
    await locator.waitFor({ state: "visible", timeout });
  });

// playwright's setFiles refuses >50 MB over CDP because a remote browser can't
// receive buffers. DOM.setFileInputFiles takes a path instead, and the browser
// reads the FUSE file itself — the same code path setFiles uses when local.
const setNativeFiles = async (page: Page, selector: string, file: string) => {
  const session = await page.context().newCDPSession(page);
  try {
    const { root } = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector,
    });
    if (nodeId === 0) {
      throw new Error(`no input matches ${selector}`);
    }
    await session.send("DOM.setFileInputFiles", { files: [file], nodeId });
  } finally {
    await session.detach();
  }
};

/**
 * After a relaunch the row offers "Continue" and the sheet's Continue block
 * offers "Choose files". The pick happens through a real file chooser, which
 * is the only path the browser gives a page to a file.
 */
const pickFileThroughUi = Effect.fn("Gate.pickFileThroughUi")(function* pick(
  page: Page,
  row: (page: Page) => Locator,
  file: string,
) {
  const dialog = page.locator("dialog");
  // The sheet can already be open: the app restores it across reloads, and a
  // row click then hits the dialog overlay. Only open it when closed.
  yield* Effect.promise(async () => {
    if (!(await dialog.isVisible())) {
      await row(page).getByRole("button", { name: "Continue" }).click();
    }
  });
  yield* waitVisible(dialog.getByRole("button", { name: "Choose files" }));
  const chooser = page.waitForEvent("filechooser");
  yield* Effect.promise(async () => {
    await dialog.getByRole("button", { name: "Choose files" }).click();
    await chooser;
  });
  const pickedAt = Date.now();
  yield* Effect.promise(async () => {
    await setNativeFiles(page, 'dialog input[type="file"]:not([webkitdirectory])', file);
  });
  return pickedAt;
});

// Set by the gate body once CreateDelivery lands; the ensuring sibling reads
// it, and a Ref can't be shared across the two generators without one.
let sentDelivery: DeliveryId | undefined;

scenario(
  `Gate · ${gateName} survives its faults and delivers one verified file`,
  { timeout: Duration.toMillis("8 hours") },
  Effect.gen(function* gateRun() {
    const { api, anon } = yield* Target;
    const browser = yield* Browser;
    const net = yield* NetControl;
    const ledger = yield* Ledger;
    const run = yield* Run;

    yield* run.record("gate", gateName);
    yield* run.record("size", size);
    if (sizeOverride !== undefined) {
      // A rehearsal is not the gate; the result must say the size was cut.
      yield* run.record("sizeOverridden", true);
    }

    // a. The file exists only as a FUSE computation; hashing it here is the
    // expected digest the download must match byte for byte.
    const seed = randomUUID();
    // The run id makes the delivery title unique, so row locators can never
    // hit an older run's delivery on a shared staging account.
    const runId = randomUUID().slice(0, 8);
    const name = `gate-${gateName}-${runId}.bin`;
    // Row lookups are scoped to this delivery's title; staging carries other
    // runs' deliveries for the same user.
    const deliveryRow = (page: Page) =>
      page.locator("li").filter({ has: page.getByRole("button", { exact: true, name }) });
    const mtimeMs = Date.now();
    const realPath = yield* mountSynthFile({
      dir: path.join(run.dir, "real"),
      mtimeMs,
      name,
      seed,
      size,
    });
    const hashed = yield* sha256File(realPath);
    yield* run.record("sourceSha256", hashed.sha256);
    yield* run.record("sourceHashSeconds", hashed.seconds);
    yield* run.record("sourceHashThroughput", mibPerSecond(hashed.bytes, hashed.seconds));
    expect(hashed.bytes).toBe(size);

    // b. Send it through the dashboard exactly as a user would.
    yield* browser.launch;
    const sentAt = Date.now();
    let page = yield* browser.page;
    yield* Effect.promise(async () => {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Choose files" }).first().click();
      await chooser;
      await setNativeFiles(page, 'input[type="file"][multiple]', realPath);
    });
    yield* run.step("sent");

    // The delivery id and link come from the API, same staging user.
    const delivery = yield* api.Deliveries().pipe(
      Effect.flatMap((list) => {
        const found = list.find((d) => d.transfers.some((t) => t.path === name && t.size === size));
        return found === undefined
          ? Effect.fail(new Pending({ message: "delivery not yet listed" }))
          : Effect.succeed(found);
      }),
      Effect.retry({ schedule: Schedule.spaced("2 seconds"), times: 15 }),
    );
    sentDelivery = delivery.id;
    yield* run.record("deliveryId", delivery.id);

    const ackedNow = Effect.map(ledger.all, (all) => ackedParts(all).size);
    // After a self-healing fault, one more distinct part must arrive or the
    // product stalled.
    const waitProgress = Effect.flatMap(ackedNow, (current) => ledger.waitForAcked(current + 1));

    const verifyDurations: number[] = [];
    // From the pick to the first part PUT is ListParts plus the per-part MD5
    // verification of every part R2 already holds.
    const recordVerify = (pickedAt: number) =>
      Effect.map(ledger.waitForRequest(pickedAt, "part"), (request) => {
        verifyDurations.push(request.at - pickedAt);
      });

    // c. Inject each fault at its fraction of acked parts.
    for (const { at, fault } of gate.faults) {
      yield* ledger.waitForAcked(Math.ceil(at * totalParts));
      yield* run.step(`fault-${fault.kind}`);
      switch (fault.kind) {
        case "offline": {
          yield* net.offline(fault.for);
          yield* waitProgress;
          break;
        }
        case "failPart": {
          const fired = yield* awaitFired(yield* net.failPartOnce, "failPart");
          yield* run.record("failPartFired", fired);
          // The injected 503 is the browser's to recover from, unaided.
          yield* ledger.waitForPartAcked(fired.partNumber, fired.at);
          break;
        }
        case "sleep": {
          yield* browser.freeze(fault.for);
          yield* waitProgress;
          break;
        }
        case "closeTab": {
          const tab = page;
          yield* Effect.promise(async () => {
            await tab.close();
          });
          page = yield* browser.open("/deliveries");
          const pickedAt = yield* pickFileThroughUi(page, deliveryRow, realPath);
          yield* recordVerify(pickedAt);
          yield* run.manual("pick file after closeTab");
          break;
        }
        case "reload":
        case "crash": {
          if (fault.kind === "reload") {
            const current = page;
            yield* Effect.promise(async () => await current.reload());
          } else {
            yield* browser.crash;
            yield* browser.launch;
          }
          page = yield* browser.page;
          const pickedAt = yield* pickFileThroughUi(page, deliveryRow, realPath);
          yield* recordVerify(pickedAt);
          yield* run.manual(`pick file after ${fault.kind}`);
          break;
        }
        case "impostor": {
          const before = page;
          yield* Effect.promise(async () => await before.reload());
          const current = yield* browser.page;
          yield* waitVisible(deliveryRow(current).getByRole("button", { name: "Continue" }));
          // The flip lands inside part 2 at partSize + partSize/2 + 4096:
          // between the fingerprint's sampled spots, so only the per-part
          // MD5 check against R2's ETags can catch it.
          const flip = partBytes + Math.floor(partBytes / 2) + 4096;
          const impostorPath = yield* mountSynthFile({
            dir: path.join(run.dir, "impostor"),
            flip,
            mtimeMs,
            name,
            seed,
            size,
          });
          const impostorAt = yield* pickFileThroughUi(current, deliveryRow, impostorPath);
          yield* run.manual("pick changed file");
          yield* waitVisible(
            current.locator("dialog [role='alert']").filter({ hasText: "has changed" }),
          );
          // A refused pick must not have signed or sent anything.
          const sincePick = yield* ledger.since(impostorAt);
          expect(
            sincePick.filter((entry) => entry.kind === "part" || entry.kind === "create"),
          ).toEqual([]);
          const realPickAt = yield* pickFileThroughUi(current, deliveryRow, realPath);
          yield* recordVerify(realPickAt);
          yield* run.manual("pick file after impostor");
          yield* waitProgress;
          break;
        }
        default: {
          break;
        }
      }
    }

    // d. Near the end, R2 completes the upload but the response never arrives.
    yield* ledger.waitForAcked(totalParts - 10);
    const lostStatus = yield* net.loseCompleteResponse;
    yield* run.step("lost-complete-armed");

    // e. The UI says Ready and the API agrees the transfer is complete.
    const currentPage = yield* browser.page;
    yield* Effect.promise(async () => {
      // A fault pick can leave the delivery's sheet open; the row title click
      // then hits the dialog overlay instead. Only open it when closed.
      if (!(await currentPage.locator("dialog").isVisible())) {
        await deliveryRow(currentPage).getByRole("button", { exact: true, name }).click();
      }
    });
    yield* waitVisible(currentPage.locator("dialog").getByText("Ready", { exact: true }), 600_000);
    const finished = yield* api.Deliveries().pipe(
      Effect.flatMap((list) => {
        const found = list.find((d) => d.id === delivery.id);
        return found !== undefined &&
          found.status === "ready" &&
          found.transfers.every((t) => t.state === "complete")
          ? Effect.succeed(found)
          : Effect.fail(new Pending({ message: "not ready yet" }));
      }),
      Effect.retry({
        schedule: Schedule.spaced("5 seconds").pipe(Schedule.upTo({ duration: "30 minutes" })),
      }),
    );
    const readyAt = Date.now();
    yield* run.step("ready");
    yield* run.record("lostCompleteR2Status", yield* awaitFired(lostStatus, "lost-Complete"));

    // f. The anonymous download verifies byte for byte.
    const token = finished.link.slice("/d/".length);
    const shared = yield* anon.OpenLink({ token });
    expect(shared.files).toHaveLength(1);
    const downloadStarted = performance.now();
    // A 100 GiB GET outlives some connections (R2 closed one at 18.7 GB), so
    // a drop resumes with Range from the last byte received, through a fresh
    // link URL in case the old one expired. Like a browser's resume, it gives
    // up only after several drops in a row with no progress.
    const hash = createHash("sha256");
    // Reads from `from` to the end into the hash; reports bytes read even when
    // the connection drops partway.
    const readFrom = (url: string, from: number) =>
      Effect.promise(async () => {
        let read = 0;
        try {
          const response = await fetch(
            url,
            from === 0 ? {} : { headers: { range: `bytes=${from}-` } },
          );
          if (response.status === (from === 0 ? 200 : 206) && response.body !== null) {
            const stream: AsyncIterable<Uint8Array> = response.body;
            for await (const chunk of stream) {
              read += chunk.length;
              hash.update(chunk);
            }
          }
        } catch {
          // A dropped connection; the caller resumes from what arrived.
        }
        return read;
      });
    let bytes = 0;
    const drops: number[] = [];
    let stuck = 0;
    while (bytes < size && stuck < 5) {
      const [file] = (yield* anon.OpenLink({ token })).files;
      expect(file).toBeDefined();
      const read = yield* readFrom(file?.url ?? "", bytes);
      bytes += read;
      if (bytes < size) {
        drops.push(bytes);
        stuck = read === 0 ? stuck + 1 : 0;
        yield* Effect.sleep("2 seconds");
      }
    }
    yield* run.record("downloadDrops", drops);
    const download = { bytes, sha256: hash.digest("hex") };
    const downloadSeconds = (performance.now() - downloadStarted) / 1000;
    expect(download.bytes).toBe(size);
    expect(download.sha256).toBe(hashed.sha256);
    yield* run.record("downloadSeconds", downloadSeconds);
    yield* run.record("downloadThroughput", mibPerSecond(size, downloadSeconds));

    // g. The ledger is the byte-level proof.
    const summary = summarize(yield* ledger.all, size);
    expect(summary.uploadIds).toHaveLength(1);
    expect(summary.creates.acked).toBe(1);
    expect(summary.parts.avoidable).toEqual([]);
    expect(summary.parts.missing).toEqual([]);
    const expectedManual = gate.faults.flatMap(({ fault }) => {
      if (fault.kind === "reload" || fault.kind === "closeTab" || fault.kind === "crash") {
        return [`pick file after ${fault.kind}`];
      }
      if (fault.kind === "impostor") {
        return ["pick changed file", "pick file after impostor"];
      }
      return [];
    });
    expect(yield* run.manualReasons).toEqual(expectedManual);
    yield* run.step("verified");

    // h. Numbers for the run report.
    yield* run.record("summary", summary);
    yield* run.record("verifyDurationsMs", verifyDurations);
    yield* run.record("uploadSeconds", (readyAt - sentAt) / 1000);
    yield* run.record("uploadThroughput", mibPerSecond(size, (readyAt - sentAt) / 1000));
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* cleanup() {
        // GATE_KEEP=1 leaves the delivery for inspection; the browser and
        // mounts still come down.
        if (process.env.GATE_KEEP !== "1") {
          const { api } = yield* Target;
          // Cancel the exact delivery this run created, whatever its status:
          // the API's cancel removes objects of ready deliveries too, so a
          // passed gate leaves nothing in R2.
          if (sentDelivery !== undefined) {
            yield* api.CancelDelivery({ deliveryId: sentDelivery }).pipe(Effect.ignore);
          }
        }
        yield* (yield* Browser).close.pipe(Effect.ignore);
      }),
    ),
  ),
);

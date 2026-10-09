import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { assertBudget, captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import {
  Api,
  Authenticated,
  CurrentPrincipal,
  LinkLocked,
  WrongPassword,
} from "@tranzfer/contracts";
import type { SharedDelivery } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as RpcTest from "effect/rpc/RpcTest";
import { flush } from "solid-js";

import { ApiClient } from "../api/client";
import { RuntimeContext } from "../api/solid-effect";
import { Uploads } from "../uploads/uploads";
import type { Folder, SavedFile } from "./save-folder";
import { LinkPage } from "../routes/d/[token]";
import { Previews, previewKind } from "./Previews";
import { SaveAll } from "./SaveAll";
import { Unlock } from "./Unlock";

const source = new Map([
  ["Card/A001/clip1.mov", 3000],
  ["Card/A001/clip2.mov", 5000],
  ["Card/B002/clip3.mov", 4000],
  ["notes.txt", 10],
]);
const bytesOf = (path: string) =>
  Uint8Array.from({ length: source.get(path) ?? 0 }, (_, index) => (index * 7 + path.length) % 251);

const sharedFile = (path: string, size: number) => ({ path, size, url: `https://r2.test/${path}` });

const delivery: SharedDelivery = {
  expiresAt: new Date("2026-10-12T08:00:00Z"),
  files: [...source].map(([path, size]) => sharedFile(path, size)),
  note: "",
  senderName: "Sender",
  title: "Card",
};

// The picked folder, in memory. Writes land only on close(), like Chromium's
// swap file.
const makeDisk = () => {
  const files = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  const fileAt = (path: string): SavedFile => ({
    createWritable: async ({ keepExistingData }) => {
      let swap = keepExistingData ? Uint8Array.from(files.get(path) ?? []) : new Uint8Array();
      let at = 0;
      return await Promise.resolve({
        close: async () => {
          await Promise.resolve(files.set(path, swap));
        },
        seek: async (position: number) => {
          at = await Promise.resolve(position);
        },
        write: async (view: ArrayBufferView) => {
          const data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
          const next = new Uint8Array(Math.max(swap.length, at + data.length));
          next.set(swap);
          next.set(data, at);
          swap = next;
          at = await Promise.resolve(at + data.length);
        },
      });
    },
    getFile: async () => await Promise.resolve(new Blob([Uint8Array.from(files.get(path) ?? [])])),
  });
  const folderAt = (prefix: string, name: string): Folder => ({
    getDirectoryHandle: async (child) => {
      folders.add(`${prefix}${child}`);
      return await Promise.resolve(folderAt(`${prefix}${child}/`, child));
    },
    getFileHandle: async (child) => {
      const path = `${prefix}${child}`;
      files.set(path, files.get(path) ?? new Uint8Array());
      return await Promise.resolve(fileAt(path));
    },
    name,
  });
  return { files, folders, root: folderAt("", "Recipient") };
};

// A link with a password: the right one trades for this unlock, and only it opens the link.
const UNLOCK = "unlock-token";

const makeWorld = (options: { locked?: boolean } = {}) => {
  const reports: string[] = [];
  // The unlock each call carried, in order.
  const opens: (string | undefined)[] = [];
  const reportUnlocks: (string | undefined)[] = [];
  const api = Layer.effect(ApiClient, RpcTest.makeClient(Api)).pipe(
    Layer.provide(
      Api.toLayer(
        Api.of({
          CancelDelivery: () => Effect.die("unused"),
          ClearDeliveries: () => Effect.die("unused"),
          CreateDelivery: () => Effect.die("unused"),
          Deliveries: () => Effect.die("unused"),
          DeliveryEmails: () => Effect.die("unused"),
          FinalizeTransfer: () => Effect.die("unused"),
          GetBilling: () => Effect.die("unused"),
          JoinInterest: () => Effect.die("unused"),
          Me: () => Effect.die("unused"),
          OpenBillingPortal: () => Effect.die("unused"),
          OpenLink: ({ unlock }) =>
            Effect.suspend(() => {
              opens.push(unlock);
              return options.locked === true && unlock !== UNLOCK
                ? Effect.fail(new LinkLocked({ senderName: "Sender" }))
                : Effect.succeed(delivery);
            }),
          RedeemCode: () => Effect.die("unused"),
          ReportDownload: ({ event, path, unlock }) =>
            Effect.sync(() => {
              reports.push(`${event} ${path}`);
              reportUnlocks.push(unlock);
            }),
          SendDeliveryEmail: () => Effect.die("unused"),
          SetLinkPassword: () => Effect.die("unused"),
          SignUpload: () => Effect.die("unused"),
          StartCheckout: () => Effect.die("unused"),
          UnlockLink: ({ password }) =>
            password === "right one"
              ? Effect.succeed({ expiresAt: new Date("2026-10-13T08:00:00Z"), unlock: UNLOCK })
              : Effect.fail(new WrongPassword()),
          UpdateDelivery: () => Effect.die("unused"),
        }),
      ),
    ),
    Layer.provide(
      Layer.succeed(
        Authenticated,
        Authenticated.of((effect) =>
          effect.pipe(
            Effect.provideService(CurrentPrincipal, {
              email: "s@test",
              id: "s",
              image: null,
              name: "Sender",
            }),
          ),
        ),
      ),
    ),
  );
  const uploads = Layer.succeed(
    Uploads,
    Uploads.of({
      cancel: () => Effect.die("unused"),
      restore: () => Effect.void,
      resume: () => Effect.succeed([]),
      retry: () => Effect.die("unused"),
      send: () => Effect.die("unused"),
    }),
  );
  const request = Layer.succeed(
    HttpServerRequest.HttpServerRequest,
    HttpServerRequest.fromWeb(new Request("http://test/rpc")),
  );
  return {
    opens,
    reportUnlocks,
    reports,
    runtime: ManagedRuntime.make(Layer.mergeAll(api, uploads).pipe(Layer.provide(request))),
  };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.showDirectoryPicker = undefined;
});

describe("SaveAll", () => {
  // A link without a password saves as it always did; with one, every call
  // carries the page's unlock.
  it.each([
    { locked: false, unlock: undefined },
    { locked: true, unlock: UNLOCK },
  ])(
    "fills a picked folder, skipping finished files and resuming partial ones (locked: $locked)",
    async ({ locked, unlock }) => {
      const disk = makeDisk();
      // A reload left clip1 whole and clip2 two thousand bytes in.
      disk.files.set("Card/A001/clip1.mov", bytesOf("Card/A001/clip1.mov"));
      disk.files.set("Card/A001/clip2.mov", bytesOf("Card/A001/clip2.mov").slice(0, 2000));
      window.showDirectoryPicker = async () => await Promise.resolve(disk.root);
      const ranges = new Map<string, string | null>();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const path = new Request(input).url.replace("https://r2.test/", "");
        const range = new Headers(init?.headers).get("range");
        ranges.set(path, range);
        const from = range === null ? 0 : Number(range.replace("bytes=", "").replace("-", ""));
        return await Promise.resolve(
          new Response(bytesOf(path).slice(from), { status: range === null ? 200 : 206 }),
        );
      });
      const { opens, reports, reportUnlocks, runtime } = makeWorld({ locked });
      render(() => (
        <RuntimeContext value={runtime}>
          <SaveAll delivery={delivery} token="token" unlock={unlock} />
        </RuntimeContext>
      ));

      const { artifact } = await captureArtifact(
        async () => {
          screen.getByRole("button", { name: "Download all" }).click();
          // ByRole skips hidden panes, so this waits for the done pane to show.
          expect(await screen.findByRole("status")).toHaveTextContent(
            "All 4 files are in Recipient.",
          );
        },
        { scenario: "save-all" },
      );

      flush();
      expect(Object.fromEntries(disk.files)).toEqual(
        Object.fromEntries([...source.keys()].map((path) => [path, bytesOf(path)])),
      );
      expect([...disk.folders].toSorted()).toEqual(["Card", "Card/A001", "Card/B002"]);
      // The whole file is never asked for again; the partial one continues.
      expect(Object.fromEntries(ranges)).toEqual({
        "Card/A001/clip2.mov": "bytes=2000-",
        "Card/B002/clip3.mov": null,
        "notes.txt": null,
      });
      // The sender hears each file start and finish, the skipped one included.
      await vi.waitFor(() => {
        expect(reports.toSorted()).toEqual(
          [...source.keys()].flatMap((path) => [`saved ${path}`, `started ${path}`]).toSorted(),
        );
      });
      expect(new Set(opens)).toEqual(new Set([unlock]));
      expect(new Set(reportUnlocks)).toEqual(new Set([unlock]));
      expect(artifact).toHaveNoDiagnostics();
      // Idle to saving to done flips the three panes' hidden bindings. Every progress report
      // (start and end of each file) re-runs only the counts, the current path
      // and the bar: 28 runs, plus room for one throttled byte report.
      assertBudget(artifact, { allow: [], maxReruns: 32, maxWastedRuns: 0 });
      await runtime.dispose();
    },
  );

  it("tells a save that outlived its unlock to unlock again", async () => {
    window.showDirectoryPicker = async () => await Promise.resolve(makeDisk().root);
    const { reports, runtime } = makeWorld({ locked: true });
    render(() => (
      <RuntimeContext value={runtime}>
        <SaveAll delivery={delivery} token="token" unlock="an-old-unlock" />
      </RuntimeContext>
    ));
    screen.getByRole("button", { name: "Download all" }).click();
    expect(await screen.findByRole("alert")).toHaveTextContent("The password unlock has run out.");
    expect(reports).toEqual([]);
    await runtime.dispose();
  });

  it("points browsers without a folder picker to Chrome or Edge", () => {
    const { runtime } = makeWorld();
    render(() => (
      <RuntimeContext value={runtime}>
        <SaveAll delivery={delivery} token="token" unlock={undefined} />
      </RuntimeContext>
    ));
    flush();
    expect(screen.getByText(/This browser can't save a whole folder/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download all" })).toBeNull();
  });

  it("asks for the password before any file name, and a wrong one says so", async () => {
    const { runtime } = makeWorld({ locked: true });
    const unlocked: string[] = [];
    render(() => (
      <RuntimeContext value={runtime}>
        <Unlock
          onUnlock={(unlock) => {
            unlocked.push(unlock);
          }}
          senderName="Sender"
          token="token"
        />
      </RuntimeContext>
    ));
    flush();
    expect(screen.getByRole("heading")).toHaveTextContent("This delivery has a password.");
    expect(screen.getByText("Ask the sender for it.")).toBeInTheDocument();

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.input(screen.getByLabelText("Password"), { target: { value: "wrong one" } });
        flush();
        screen.getByRole("button", { name: "Unlock" }).click();
        expect(await screen.findByRole("alert")).toHaveTextContent("That password isn't right.");
        expect(unlocked).toEqual([]);

        fireEvent.input(screen.getByLabelText("Password"), { target: { value: "right one" } });
        flush();
        screen.getByRole("button", { name: "Unlock" }).click();
        await vi.waitFor(() => {
          expect(unlocked).toEqual([UNLOCK]);
        });
      },
      { scenario: "unlock-form" },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ["OPTIMISTIC_REVERTED"] });
    await runtime.dispose();
  });

  it("previews what a browser can show, from the signed URL, and never reports a download", async () => {
    const files = [
      sharedFile("shots/a.jpg", 2_000_000),
      sharedFile("shots/b.HEIC", 3_000_000),
      sharedFile("shots/huge.png", 26_000_000),
      sharedFile("clips/take1.mp4", 500_000_000),
      sharedFile("clips/take2.mov", 40_000_000_000),
      sharedFile("clips/A001.braw", 900_000),
      sharedFile("clips/A002.r3d", 900_000),
      sharedFile("audio/room.wav", 20_000_000),
      sharedFile("notes.txt", 10),
    ];
    expect(files.map((file) => previewKind(file))).toEqual([
      "image",
      "image",
      undefined,
      "video",
      undefined,
      undefined,
      undefined,
      "audio",
      undefined,
    ]);

    const fetched = vi.spyOn(globalThis, "fetch");
    const { reports, runtime } = makeWorld({ locked: true });
    render(() => (
      <RuntimeContext value={runtime}>
        <Previews files={files} />
      </RuntimeContext>
    ));
    const { artifact } = await captureArtifact(
      () => {
        flush();
        const images = within(screen.getByRole("region", { name: "Previews" })).getAllByRole("img");
        expect(images.map((image) => image.getAttribute("src"))).toEqual([
          "https://r2.test/shots/a.jpg",
          "https://r2.test/shots/b.HEIC",
        ]);
        for (const image of images) {
          expect(image).toHaveAttribute("loading", "lazy");
          expect(image).toHaveAttribute("decoding", "async");
        }
        // Audio shows its player at once and loads nothing until played.
        const audio = document.querySelector("audio");
        expect(audio).toHaveAttribute("src", "https://r2.test/audio/room.wav");
        expect(audio).toHaveAttribute("preload", "none");
        expect(audio?.controls).toBe(true);

        // Video waits for a click.
        expect(document.querySelector("video")).toBeNull();
        screen.getByRole("button", { name: "Play take1.mp4" }).click();
        flush();
        const video = document.querySelector("video");
        expect(video).toHaveAttribute("src", "https://r2.test/clips/take1.mp4");
        expect(video).toHaveAttribute("preload", "metadata");
        expect(video?.controls).toBe(true);

        // A browser that can't decode a file swaps the player for words.
        fireEvent.error(video ?? document.body);
        flush();
        expect(screen.getByRole("status")).toHaveTextContent("Your browser can't play this one.");
        fireEvent.error(images[1] ?? document.body);
        flush();
        expect(
          within(screen.getByRole("region", { name: "Previews" })).getAllByRole("img"),
        ).toHaveLength(1);
      },
      { scenario: "previews" },
    );
    expect(artifact).toHaveNoDiagnostics();
    // The browser fetched nothing through the app, and the sender heard nothing.
    expect(fetched).not.toHaveBeenCalled();
    expect(reports).toEqual([]);
    await runtime.dispose();
  });

  it("opens a locked link to the password form, then to its files with the unlock on every call", async () => {
    const { opens, reports, reportUnlocks, runtime } = makeWorld({ locked: true });
    render(() => (
      <RuntimeContext value={runtime}>
        <LinkPage token="token" />
      </RuntimeContext>
    ));
    const { artifact } = await captureArtifact(
      async () => {
        expect(await screen.findByText("This delivery has a password.")).toBeInTheDocument();
        // No file name, title or URL is on the page yet.
        expect(screen.queryByText("notes.txt")).toBeNull();
        expect(screen.queryByText("Card")).toBeNull();
        expect(document.querySelector("a, video, img")).toBeNull();

        fireEvent.input(screen.getByLabelText("Password"), { target: { value: "right one" } });
        flush();
        screen.getByRole("button", { name: "Unlock" }).click();
        expect(await screen.findByRole("heading", { name: "Card" })).toBeInTheDocument();
      },
      { scenario: "locked-link" },
    );
    flush();
    expect(opens).toEqual([undefined, UNLOCK]);
    // Files are listed and the clips can be previewed, with the unlock only in the open.
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    screen.getByRole("button", { name: "Play clip1.mov" }).click();
    flush();
    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "https://r2.test/Card/A001/clip1.mov",
    );
    expect(reports).toEqual([]);
    expect(reportUnlocks).toEqual([]);
    expect(artifact).toHaveNoDiagnostics({ allow: ["OPTIMISTIC_REVERTED"] });
    await runtime.dispose();
  });
});

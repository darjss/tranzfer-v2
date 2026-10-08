import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { assertBudget, captureArtifact } from "@solidjs/diagnostics";
import "@solidjs/diagnostics/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { Api, Authenticated, CurrentPrincipal } from "@tranzfer/contracts";
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
import { SaveAll } from "./SaveAll";

const source = new Map([
  ["Card/A001/clip1.mov", 3000],
  ["Card/A001/clip2.mov", 5000],
  ["Card/B002/clip3.mov", 4000],
  ["notes.txt", 10],
]);
const bytesOf = (path: string) =>
  Uint8Array.from({ length: source.get(path) ?? 0 }, (_, index) => (index * 7 + path.length) % 251);

const delivery: SharedDelivery = {
  expiresAt: new Date("2026-10-12T08:00:00Z"),
  files: [...source].map(([path, size]) => ({ path, size, url: `https://r2.test/${path}` })),
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

const makeWorld = () => {
  const api = Layer.effect(ApiClient, RpcTest.makeClient(Api)).pipe(
    Layer.provide(
      Api.toLayer(
        Api.of({
          CancelDelivery: () => Effect.die("unused"),
          ClearDeliveries: () => Effect.die("unused"),
          CreateDelivery: () => Effect.die("unused"),
          Deliveries: () => Effect.die("unused"),
          FinalizeTransfer: () => Effect.die("unused"),
          GetBilling: () => Effect.die("unused"),
          Me: () => Effect.die("unused"),
          OpenBillingPortal: () => Effect.die("unused"),
          OpenLink: () => Effect.succeed(delivery),
          SignUpload: () => Effect.die("unused"),
          StartCheckout: () => Effect.die("unused"),
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
  return ManagedRuntime.make(Layer.mergeAll(api, uploads).pipe(Layer.provide(request)));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.showDirectoryPicker = undefined;
});

describe("SaveAll", () => {
  it("fills a picked folder, skipping finished files and resuming partial ones", async () => {
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
    const runtime = makeWorld();
    render(() => (
      <RuntimeContext value={runtime}>
        <SaveAll delivery={delivery} token="token" />
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
    expect(artifact).toHaveNoDiagnostics();
    // Idle to saving to done flips the three panes' hidden bindings. Every progress report
    // (start and end of each file) re-runs only the counts, the current path
    // and the bar: 28 runs, plus room for one throttled byte report.
    assertBudget(artifact, { allow: [], maxReruns: 32, maxWastedRuns: 0 });
    await runtime.dispose();
  });

  it("points browsers without a folder picker to Chrome or Edge", () => {
    const runtime = makeWorld();
    render(() => (
      <RuntimeContext value={runtime}>
        <SaveAll delivery={delivery} token="token" />
      </RuntimeContext>
    ));
    flush();
    expect(screen.getByText(/This browser can't save a whole folder/u)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download all" })).toBeNull();
  });
});

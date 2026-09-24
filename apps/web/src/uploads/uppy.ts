import type { AwsS3Options } from "@uppy/aws-s3";
import AwsS3 from "@uppy/aws-s3";
import { Uppy } from "@uppy/core";
import type { Body, Meta } from "@uppy/core/utils";
import { NotUploaded, partSize, RelativePath, usesMultipart } from "@tranzfer/contracts";
import type { NewFile, UploadRequest } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import type { ManagedRuntime } from "effect/ManagedRuntime";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";

import { ApiClient } from "../api/client";
import { bumpDeliveries, patchTransfer, transfers, wireWindow } from "./store";

type Runtime = ManagedRuntime<ApiClient, never>;

type SignRequest = Extract<AwsS3Options<Meta, Body>, { signRequest: unknown }>["signRequest"];
export type PresignableRequest = Parameters<SignRequest>[0];

// Finalize retries: a just-completed multipart object can lag on HEAD.
const FINALIZE_ATTEMPTS = 4;
const FINALIZE_BASE_MS = 800;
// Smoothing applied to each new speed sample so single slow chunks do not
// move the ETA wildly.
const SPEED_EMA = 0.25;
// Files that only clutter transfers and never carry data.
const SKIPPED = /^\.DS_Store$|^Thumbs\.db$/u;
const isSkipped = (path: string) =>
  path.split("/").some((segment) => SKIPPED.test(segment) || segment.startsWith("._"));

const metaString = (meta: Meta, key: string): string | undefined => {
  const value: unknown = meta[key];
  return Schema.is(Schema.String)(value) ? value : undefined;
};

export interface ChosenFile {
  readonly file: File;
  readonly path: string;
}

// Dropped folder entries carry relativePath; folder inputs carry
// webkitRelativePath; plain picks carry neither.
// webkitRelativePath is "" (not undefined) on plain picks, so an empty
// relative path must fall through to the file name.
export const chosenPath = (file: File & { relativePath?: string }) => {
  const relative = file.relativePath ?? file.webkitRelativePath;
  return (relative === undefined || relative === "" ? file.name : relative).replace(/^\/+/u, "");
};

export const chosenFiles = (files: Iterable<File>) => {
  const chosen: ChosenFile[] = [];
  for (const file of files) {
    const path = chosenPath(file);
    if (path !== "" && !isSkipped(path)) {
      chosen.push({ file, path });
    }
  }
  return chosen;
};

export const invalidPaths = (files: readonly ChosenFile[]) =>
  files.filter(({ path }) => !Schema.is(RelativePath)(path)).map(({ path }) => path);

// The title is the single shared top folder when there is one, the file name
// for a lone file, or "<first> and N more" for several loose files.
const deliveryTitle = (files: readonly ChosenFile[]) => {
  const [first] = files;
  if (first === undefined) {
    return "Delivery";
  }
  const [top] = first.path.split("/");
  if (files.length > 1 && files.every(({ path }) => path.startsWith(`${top}/`))) {
    return top;
  }
  if (files.length === 1) {
    return first.file.name;
  }
  return `${first.file.name} and ${files.length - 1} more`;
};

const toUploadRequest = (request: PresignableRequest): UploadRequest =>
  Match.value(request).pipe(
    Match.when({ method: "PUT" }, (put): UploadRequest =>
      "uploadId" in put
        ? { _tag: "Part", partNumber: put.partNumber, uploadId: put.uploadId }
        : { _tag: "Put" },
    ),
    Match.when({ method: "GET" }, (get): UploadRequest => ({
      _tag: "List",
      uploadId: get.uploadId,
    })),
    Match.when({ method: "DELETE" }, (): UploadRequest => {
      // The server never signs aborts; cancel is a server-side operation.
      throw new Error("Aborts go through CancelDelivery");
    }),
    Match.orElse((post): UploadRequest =>
      "uploadId" in post ? { _tag: "Complete", uploadId: post.uploadId } : { _tag: "Create" },
    ),
  );

const sign = async (runtime: Runtime, request: PresignableRequest) =>
  await runtime.runPromise(
    ApiClient.pipe(
      Effect.flatMap((api) =>
        api.SignUpload({ key: request.key, request: toUploadRequest(request) }),
      ),
    ),
  );

const rates = new Map<string, { at: number; bytes: number }>();

const sampleSpeed = (transferId: string, bytesUploaded: number): number | null => {
  const now = Date.now();
  const previous = rates.get(transferId);
  rates.set(transferId, { at: now, bytes: bytesUploaded });
  if (previous === undefined || now === previous.at || bytesUploaded <= previous.bytes) {
    return null;
  }
  return ((bytesUploaded - previous.bytes) / (now - previous.at)) * 1000;
};

// R2 can take a moment to make a completed multipart object visible to HEAD,
// so a NotUploaded is retried a few times before giving up.
const finalize = async (runtime: Runtime, transferId: string, attempt = 0) => {
  try {
    return await runtime.runPromise(
      ApiClient.pipe(Effect.flatMap((api) => api.FinalizeTransfer({ transferId }))),
    );
  } catch (error) {
    if (error instanceof NotUploaded && attempt + 1 < FINALIZE_ATTEMPTS) {
      await Effect.runPromise(Effect.sleep(`${FINALIZE_BASE_MS * 2 ** attempt} millis`));
      return await finalize(runtime, transferId, attempt + 1);
    }
    throw error;
  }
};

// One Uppy for the whole session, created lazily with the app's runtime. It
// is never destroyed, uninstalled or cancelled by component cleanup or
// navigation: Uppy aborts remote uploads on uninstall and on file removal,
// and the server refuses to sign aborts anyway, so teardown would silently
// kill in-flight work (law 11).
let engine: { uppy: Uppy<Meta, Body>; runtime: Runtime } | undefined;

export const getUploads = (runtime: Runtime) => {
  wireWindow();
  if (engine !== undefined) {
    return engine;
  }

  const uppy = new Uppy<Meta, Body>({ autoProceed: false });
  uppy.use(AwsS3, {
    allowedMetaFields: [],
    generateObjectKey: (file) => metaString(file.meta, "objectKey") ?? file.name,
    getChunkSize: ({ size }) => partSize(size),
    shouldUseMultipart: (file) => usesMultipart(file.size ?? 0),
    signRequest: async (request) => {
      const signed = await sign(runtime, request);
      return { url: signed.url };
    },
  });

  uppy.on("s3-multipart:part-uploaded", (file, part) => {
    const transferId = metaString(file.meta, "transferId");
    const size = file.size ?? 0;
    if (transferId === undefined) {
      return;
    }
    // Only confirmed parts grow the bar; in-flight bytes stay the pale tail.
    // PartNumber × partSize is exact here because Uppy 6 uploads one file's
    // parts sequentially and resumes by skipping parts the server lists, so
    // a completed part N implies parts 1..N-1 are also done.
    const confirmed = Math.min(partSize(size) * part.PartNumber, size);
    patchTransfer(transferId, { confirmed, phase: "uploading" });
  });

  uppy.on("upload-progress", (file, progress) => {
    const transferId = file === undefined ? undefined : metaString(file.meta, "transferId");
    if (transferId === undefined) {
      return;
    }
    const uploaded = progress.bytesUploaded;
    const confirmed = transfers[transferId]?.confirmed ?? 0;
    const previousSpeed = transfers[transferId]?.bytesPerSecond ?? 0;
    const sample = sampleSpeed(transferId, uploaded);
    let smoothed = previousSpeed;
    if (sample !== null) {
      smoothed =
        previousSpeed === 0 ? sample : previousSpeed * (1 - SPEED_EMA) + sample * SPEED_EMA;
    }
    patchTransfer(transferId, {
      bytesPerSecond: smoothed,
      inFlight: Math.max(uploaded - confirmed, 0),
      phase: "uploading",
    });
  });

  uppy.on("upload-success", (file) => {
    const transferId = file === undefined ? undefined : metaString(file.meta, "transferId");
    if (file === undefined || transferId === undefined) {
      return;
    }
    // A single PUT is confirmed in one shot; multipart already counted parts.
    patchTransfer(transferId, {
      confirmed: Math.max(file.size ?? 0, transfers[transferId]?.confirmed ?? 0),
      inFlight: 0,
      phase: "finalizing",
    });
    void (async () => {
      try {
        await finalize(runtime, transferId);
        patchTransfer(transferId, { bytesPerSecond: 0, phase: "done" });
        bumpDeliveries((version) => version + 1);
        // The uploader has already detached from this file, so removing it
        // frees memory without firing an abort.
        uppy.removeFile(file.id);
      } catch (error) {
        patchTransfer(transferId, {
          error: error instanceof Error ? error.message : "Finishing failed",
          phase: "failed",
        });
      }
    })();
  });

  uppy.on("upload-error", (file, error) => {
    const transferId = file === undefined ? undefined : metaString(file.meta, "transferId");
    if (transferId === undefined) {
      return;
    }
    patchTransfer(transferId, {
      bytesPerSecond: 0,
      error: error.message,
      inFlight: 0,
      phase: "failed",
    });
  });

  engine = { runtime, uppy };
  return engine;
};

export const sendFiles = async (
  runtime: Runtime,
  files: readonly ChosenFile[],
  retentionDays: 1 | 3 | 7 | 14,
) => {
  const { uppy } = getUploads(runtime);
  const delivery = await runtime.runPromise(
    ApiClient.pipe(
      Effect.flatMap((api) =>
        api.CreateDelivery({
          files: files.map(({ file, path }): NewFile => ({
            contentType: file.type === "" ? null : file.type,
            id: crypto.randomUUID(),
            lastModified: file.lastModified,
            path,
            size: file.size,
          })),
          id: crypto.randomUUID(),
          retentionDays,
          title: deliveryTitle(files),
        }),
      ),
    ),
  );
  bumpDeliveries((version) => version + 1);

  const byPath = new Map(delivery.transfers.map((transfer) => [transfer.path, transfer]));
  for (const { file, path } of files) {
    const transfer = byPath.get(path);
    if (transfer === undefined) {
      continue;
    }
    patchTransfer(transfer.id, { phase: "queued" });
    uppy.addFile({
      data: file,
      meta: {
        deliveryId: delivery.id,
        objectKey: transfer.objectKey,
        relativePath: path,
        transferId: transfer.id,
      },
      name: file.name,
      type: file.type,
    });
  }
  await uppy.upload();
  return delivery;
};

export const retryTransfer = (uppy: Uppy<Meta, Body>, transferId: string) => {
  const file = uppy
    .getFiles()
    .find((candidate) => metaString(candidate.meta, "transferId") === transferId);
  if (file !== undefined) {
    patchTransfer(transferId, { error: undefined, phase: "uploading" });
    void uppy.retryUpload(file.id);
  }
};

export const cancelDelivery = async (runtime: Runtime, deliveryId: string) => {
  const { uppy } = getUploads(runtime);
  await runtime.runPromise(
    ApiClient.pipe(Effect.flatMap((api) => api.CancelDelivery({ deliveryId }))),
  );
  for (const file of uppy.getFiles()) {
    if (metaString(file.meta, "deliveryId") === deliveryId) {
      uppy.removeFile(file.id);
    }
  }
  bumpDeliveries((version) => version + 1);
};

export { getDroppedFiles } from "@uppy/core/utils";

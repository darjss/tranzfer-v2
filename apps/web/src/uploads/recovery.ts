import { DeliveryId, TransferId } from "@tranzfer/contracts";
import * as Arr from "effect/Array";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { createStore, delMany, setMany, update, values } from "idb-keyval";
import type { UseStore } from "idb-keyval";

/**
 * What this browser remembers about one transfer, keyed by transfer id. The
 * fingerprint pins the local file; uploadId and confirmed let a refresh pick
 * up where the tab left off (RELIABILITY.md: durable metadata).
 */
export const RecoveryRecord = Schema.Struct({
  confirmed: Schema.Int,
  createdAt: Schema.Int,
  deliveryId: DeliveryId,
  fingerprint: Schema.Struct({ sha256: Schema.String, version: Schema.Literal(1) }),
  lastModified: Schema.Int,
  partSize: Schema.Int,
  path: Schema.String,
  size: Schema.Int,
  transferId: TransferId,
  uploadId: Schema.optional(Schema.String),
  version: Schema.Literal(1),
});
export interface RecoveryRecord extends Schema.Schema.Type<typeof RecoveryRecord> {}

// The store is created on first use, never at import: routes import this
// module through Uploads during SSR, where indexedDB does not exist.
let store: UseStore | undefined;
const idb = () => (store ??= createStore("tranzfer", "transfers"));

// IndexedDB is best-effort bookkeeping. A failed read or write downgrades
// resume-after-refresh for this session; it must never stop the upload.
const warn = (name: string) => (error: Cause.UnknownError) =>
  Effect.logWarning(`recovery store ${name} failed`, error);

export const remember = (records: readonly RecoveryRecord[]) =>
  Effect.tryPromise(async () => {
    await setMany(
      records.map((record) => [record.transferId, record]),
      idb(),
    );
  }).pipe(Effect.catch(warn("remember")));

export const readAll = () =>
  Effect.tryPromise(async () => await values<unknown>(idb())).pipe(
    Effect.map((rows) =>
      Arr.filterMap(rows, (row) => Schema.decodeUnknownResult(RecoveryRecord)(row)),
    ),
    Effect.catch((error) => warn("readAll")(error).pipe(Effect.as([]))),
  );

// A missing record stays missing: writing only the new field would store a
// record the decoder then drops.
export const recordUploadId = (transferId: TransferId, uploadId: string) =>
  Effect.tryPromise(async () => {
    await update<RecoveryRecord | undefined>(
      transferId,
      (record) =>
        record === undefined ? undefined : Struct.evolve(record, { uploadId: () => uploadId }),
      idb(),
    );
  }).pipe(Effect.catch(warn("recordUploadId")));

export const recordConfirmed = (transferId: TransferId, confirmed: number) =>
  Effect.tryPromise(async () => {
    await update<RecoveryRecord | undefined>(
      transferId,
      (record) =>
        record === undefined ? undefined : Struct.evolve(record, { confirmed: () => confirmed }),
      idb(),
    );
  }).pipe(Effect.catch(warn("recordConfirmed")));

export const forget = (transferIds: readonly TransferId[]) =>
  Effect.tryPromise(async () => {
    await delMany([...transferIds], idb());
  }).pipe(Effect.catch(warn("forget")));

const MIB = 1024 * 1024;
const SMALL_FILE = MIB;
const SAMPLE = 64 * 1024;
const SAMPLES = 16;

const hexOf = (digest: ArrayBuffer) =>
  [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * Fingerprint version 1: a whole-file SHA-256 at 1 MiB and under; larger
 * files hash 16 samples of 64 KiB spread over the file, ends included.
 * Sampled, not full integrity (RELIABILITY.md: file identity).
 */
export const fingerprint = (file: Blob) =>
  Effect.tryPromise(async () => {
    const parts: Blob[] = [];
    if (file.size <= SMALL_FILE) {
      parts.push(file);
    } else {
      for (let i = 0; i < SAMPLES; i += 1) {
        const offset = Math.floor((i * (file.size - SAMPLE)) / (SAMPLES - 1));
        parts.push(file.slice(offset, offset + SAMPLE));
      }
    }
    const digest = await crypto.subtle.digest("SHA-256", await new Blob(parts).arrayBuffer());
    return { sha256: hexOf(digest), version: 1 as const };
  });

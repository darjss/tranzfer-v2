import { createMD5 } from "hash-wasm";

/** One part R2 lists for an open upload. Its ETag is the part's MD5 hex. */
export interface ListedPart {
  readonly etag: string;
  readonly partNumber: number;
  readonly size: number;
}

export interface VerifyRequest {
  readonly file: Blob;
  readonly parts: readonly ListedPart[];
  readonly partSize: number;
}

/** `checked` counts bytes hashed so far, `ok` ends the run, `failed` is a read or hash error. */
export type VerifyReply =
  | { readonly checked: number }
  | { readonly ok: boolean }
  | { readonly failed: true };

// Bounds memory to one slice instead of one part.
const SLICE = 8 * 1024 * 1024;

const md5Of = async (file: Blob, start: number, end: number) => {
  const hash = await createMD5();
  const feed = async (offset: number): Promise<string> => {
    if (offset >= end) {
      return hash.digest();
    }
    hash.update(
      new Uint8Array(await file.slice(offset, Math.min(offset + SLICE, end)).arrayBuffer()),
    );
    return await feed(offset + SLICE);
  };
  return await feed(start);
};

/**
 * The fingerprint samples 16 spots, so an edit between samples could pass it.
 * Parts R2 already holds must hash to their ETags against the picked file, or
 * the resumed upload would seal an object mixing old and new bytes. Runs in a
 * worker (hash.worker.ts): hashing a 64 MiB part holds a thread for ~120 ms.
 * `onChecked` gets the bytes hashed so far after each part.
 */
export const verifyParts = async (
  file: Blob,
  parts: readonly ListedPart[],
  partSizeBytes: number,
  onChecked?: (bytes: number) => void,
) => {
  // Sequential on purpose: parallel reads would hold every part in memory.
  const check = async (index: number, checked: number): Promise<boolean> => {
    const part = parts[index];
    if (part === undefined) {
      return true;
    }
    const start = (part.partNumber - 1) * partSizeBytes;
    const expected = Math.min(partSizeBytes, file.size - start);
    if (part.partNumber < 1 || expected <= 0 || part.size !== expected) {
      return false;
    }
    if ((await md5Of(file, start, start + expected)) !== part.etag) {
      return false;
    }
    onChecked?.(checked + expected);
    return await check(index + 1, checked + expected);
  };
  return await check(0, 0);
};

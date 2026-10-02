import { describe, expect, it } from "@effect/vitest";

import { classify, summarize } from "./ledger";
import type { R2Request } from "./ledger";

const MIB = 1024 * 1024;
const HOST = "https://abc123.r2.cloudflarestorage.com";
const KEY = `${HOST}/d/delivery/file`;

const request = (partial: Partial<R2Request>): R2Request => ({
  at: 0,
  kind: "part",
  partNumber: null,
  session: 0,
  status: 200,
  uploadId: null,
  ...partial,
});

const part = (partNumber: number, status: number | null = 200, uploadId = "u1") =>
  request({ kind: "part", partNumber, status, uploadId });

describe("classify", () => {
  it("multipart create is a POST with the uploads query", () => {
    expect(classify("POST", `${KEY}?uploads=`)).toEqual({
      kind: "create",
      partNumber: null,
      uploadId: null,
    });
  });

  it("a part is a PUT naming both partNumber and uploadId", () => {
    expect(classify("PUT", `${KEY}?partNumber=7&uploadId=u1`)).toEqual({
      kind: "part",
      partNumber: 7,
      uploadId: "u1",
    });
  });

  it("a GET with uploadId is a ListParts", () => {
    expect(classify("GET", `${KEY}?uploadId=u1`)).toEqual({
      kind: "list",
      partNumber: null,
      uploadId: "u1",
    });
  });

  it("a POST with uploadId is a Complete", () => {
    expect(classify("POST", `${KEY}?uploadId=u1`)).toEqual({
      kind: "complete",
      partNumber: null,
      uploadId: "u1",
    });
  });

  it("a DELETE with uploadId is an abort", () => {
    expect(classify("DELETE", `${KEY}?uploadId=u1`)).toEqual({
      kind: "abort",
      partNumber: null,
      uploadId: "u1",
    });
  });

  it("CORS preflights are not ledger entries", () => {
    expect(classify("OPTIONS", `${KEY}?partNumber=1&uploadId=u1`)).toBeNull();
  });

  it("requests to other hosts are not ledger entries", () => {
    expect(classify("PUT", `https://staging.tranzfer.app/rpc`)).toBeNull();
    expect(classify("PUT", `https://r2.cloudflarestorage.com.evil.test/x?uploadId=u`)).toBeNull();
  });
});

describe("summarize", () => {
  // 2 parts of 64 MiB and a 10-byte tail.
  const fileSize = 2 * 64 * MIB + 10;

  it("a clean upload has every byte acked once and nothing avoidable", () => {
    const summary = summarize(
      [
        request({ kind: "create", uploadId: "u1" }),
        part(1),
        part(2),
        part(3),
        request({ kind: "complete", uploadId: "u1" }),
      ],
      fileSize,
    );
    expect(summary.uploadIds).toHaveLength(1);
    expect(summary.creates.acked).toBe(1);
    expect(summary.parts.avoidable).toEqual([]);
    expect(summary.parts.missing).toEqual([]);
    expect(summary.bytes.acked).toBe(fileSize);
  });

  it("a part acked twice counts as avoidable resent bytes", () => {
    const summary = summarize([part(1), part(2), part(2), part(3)], fileSize);
    expect(summary.parts.avoidable).toEqual([{ partNumber: 2, resent: 1 }]);
    expect(summary.bytes.avoidable).toBe(64 * MIB);
  });

  it("a part whose response never arrived is unanswered, not avoidable", () => {
    const summary = summarize([part(1), part(2, null), part(2), part(3)], fileSize);
    expect(summary.parts.avoidable).toEqual([]);
    expect(summary.parts.unanswered).toEqual([2]);
    expect(summary.bytes.unacknowledged).toBe(64 * MIB);
  });

  it("a part never acked is missing", () => {
    const summary = summarize([part(1), part(2)], fileSize);
    expect(summary.parts.missing).toEqual([3]);
  });

  it("requests naming two upload ids means a second upload started", () => {
    const summary = summarize(
      [request({ kind: "create", uploadId: "u1" }), request({ kind: "create", uploadId: "u2" })],
      fileSize,
    );
    expect(summary.uploadIds).toHaveLength(2);
  });
});

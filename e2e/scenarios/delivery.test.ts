import { createHash, randomUUID } from "node:crypto";

import { expect, layer } from "@effect/vitest";
import { DeliveryId, LinkToken, partSize, TransferId, UploadRequest } from "@tranzfer/contracts";
import type { NewDelivery } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schedule from "effect/Schedule";

import { Target } from "../src/target";

const MIB = 1024 * 1024;

type Api = Target["Service"]["api"];

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const send = async (
  method: string,
  url: string,
  body?: Uint8Array | string,
  contentType?: string,
  signedHeaders: Readonly<Record<string, string>> = {},
) => {
  const headers = new Headers(signedHeaders);
  if (contentType !== undefined) {
    headers.set("content-type", contentType);
  }
  const response = await fetch(url, { body, headers, method });
  return {
    body: Buffer.from(await response.arrayBuffer()),
    headers: response.headers,
    status: response.status,
  };
};

const required = <A>(value: A | null | undefined, message: string) =>
  value === null || value === undefined ? Effect.die(new Error(message)) : Effect.succeed(value);

const uploadId = (body: Buffer) =>
  /<UploadId>(?<id>[^<]+)<\/UploadId>/u.exec(body.toString("utf-8"))?.groups?.id;

const createUpload = (api: Api, key: string) =>
  Effect.gen(function* startUpload() {
    const signed = yield* api.SignUpload({ key, request: UploadRequest.cases.Create.make({}) });
    const created = yield* Effect.promise(
      async () => await send("POST", signed.url, new Uint8Array(0)),
    );
    expect(created.status).toBe(200);
    return yield* required(uploadId(created.body), "CreateMultipartUpload returned no UploadId");
  });

const putPart = (api: Api, key: string, mpuId: string, partNumber: number, chunk: Buffer) =>
  Effect.gen(function* uploadPart() {
    const signed = yield* api.SignUpload({
      key,
      request: UploadRequest.cases.Part.make({ partNumber, uploadId: mpuId }),
    });
    const result = yield* Effect.promise(async () => await send("PUT", signed.url, chunk));
    expect(result.status).toBe(200);
    return yield* required(
      result.headers.get("etag")?.replaceAll('"', ""),
      `part ${partNumber} returned no ETag`,
    );
  });

const completeXml = (etags: readonly string[]) =>
  `<CompleteMultipartUpload>${etags
    .map(
      (etag, index) => `<Part><PartNumber>${index + 1}</PartNumber><ETag>"${etag}"</ETag></Part>`,
    )
    .join("")}</CompleteMultipartUpload>`;

// Every non-empty file is multipart; a small one is a single part.
const uploadWhole = (api: Api, key: string, bytes: Buffer) =>
  Effect.gen(function* uploadFile() {
    const mpuId = yield* createUpload(api, key);
    const etag = yield* putPart(api, key, mpuId, 1, bytes);
    const complete = yield* api.SignUpload({
      key,
      request: UploadRequest.cases.Complete.make({ uploadId: mpuId }),
    });
    const completed = yield* Effect.promise(
      async () => await send("POST", complete.url, completeXml([etag]), "application/xml"),
    );
    expect(completed.status).toBe(200);
  });

// R2 can take a moment to make a completed multipart object visible to HEAD;
// the web client retries NotUploaded with the same backoff.
const finalize = (api: Api, transferId: TransferId) =>
  api.FinalizeTransfer({ transferId }).pipe(
    Effect.retry({
      schedule: Schedule.exponential("800 millis"),
      times: 3,
      while: Predicate.isTagged("NotUploaded"),
    }),
  );

const cleanup = (api: Api, deliveryId: DeliveryId) =>
  api
    .CancelDelivery({ deliveryId })
    .pipe(Effect.ignore({ log: "Warn", message: `cleanup cancel failed for ${deliveryId}` }));

layer(Target.layer)("staging deliveries", (it) => {
  it.effect("lifecycle · upload, finalize and anonymous download", () =>
    Effect.gen(function* lifecycle() {
      const { anon, api } = yield* Target;

      const small = Buffer.alloc(8 * 1024, 0x61);
      const bigSize = 150 * MIB;
      const big = Buffer.alloc(bigSize, 0x62);
      const now = Date.now();
      const deliveryId = DeliveryId.make(randomUUID());
      const smallId = TransferId.make(randomUUID());
      const bigId = TransferId.make(randomUUID());
      const emptyId = TransferId.make(randomUUID());
      const newDelivery: NewDelivery = {
        files: [
          {
            contentType: "text/plain",
            id: smallId,
            lastModified: now,
            path: "Ep31/small.txt",
            size: small.length,
          },
          {
            contentType: "application/octet-stream",
            id: bigId,
            lastModified: now,
            path: "Ep31/cam/big.bin",
            size: bigSize,
          },
          {
            contentType: "text/plain",
            id: emptyId,
            lastModified: now,
            path: "Ep31/empty.txt",
            size: 0,
          },
        ],
        id: deliveryId,
        retentionDays: 3,
        title: "Ep31",
      };

      const delivery = yield* api.CreateDelivery(newDelivery);
      yield* Effect.gen(function* uploaded() {
        expect(delivery.status).toBe("open");
        expect(delivery.link).toMatch(/^\/d\//u);
        const transfers = new Map(delivery.transfers.map((t) => [t.path, t]));
        const smallTransfer = yield* required(
          transfers.get("Ep31/small.txt"),
          "delivery is missing the small file transfer",
        );
        const bigTransfer = yield* required(
          transfers.get("Ep31/cam/big.bin"),
          "delivery is missing the big file transfer",
        );
        const emptyTransfer = yield* required(
          transfers.get("Ep31/empty.txt"),
          "delivery is missing the empty file transfer",
        );

        // A small file is a one-part multipart upload.
        yield* uploadWhole(api, smallTransfer.objectKey, small);
        const afterSmall = yield* finalize(api, smallId);
        expect(afterSmall.transfers.find((t) => t.id === smallId)?.state).toBe("complete");
        // An empty file is one PUT signed with If-None-Match, so replaying it
        // can't replace the object once it exists.
        const emptyPut = yield* api.SignUpload({
          key: emptyTransfer.objectKey,
          request: UploadRequest.cases.Put.make({}),
        });
        expect(emptyPut.headers).toEqual({ "content-length": "0", "if-none-match": "*" });
        const putEmpty = yield* Effect.promise(
          async () =>
            await send("PUT", emptyPut.url, new Uint8Array(0), undefined, emptyPut.headers),
        );
        expect(putEmpty.status).toBe(200);
        const replayEmpty = yield* Effect.promise(
          async () =>
            await send("PUT", emptyPut.url, new Uint8Array(0), undefined, emptyPut.headers),
        );
        expect(replayEmpty.status).toBe(412);
        yield* finalize(api, emptyId);

        // Big file: multipart create, three signed part PUTs, list, complete.
        const mpuId = yield* createUpload(api, bigTransfer.objectKey);
        const part = partSize(bigSize);
        const etags = yield* Effect.forEach([1, 2, 3], (partNumber) =>
          putPart(
            api,
            bigTransfer.objectKey,
            mpuId,
            partNumber,
            big.subarray((partNumber - 1) * part, partNumber * part),
          ),
        );

        // A second upload on the same key, fully prepared before finalize, is
        // the replay a sender could try later to swap the file. Its part is
        // the signed length, other bytes.
        const rogueId = yield* createUpload(api, bigTransfer.objectKey);
        const rogueEtag = yield* putPart(
          api,
          bigTransfer.objectKey,
          rogueId,
          1,
          Buffer.alloc(part, 0x78),
        );
        const rogueComplete = yield* api.SignUpload({
          key: bigTransfer.objectKey,
          request: UploadRequest.cases.Complete.make({ uploadId: rogueId }),
        });

        const list = yield* api.SignUpload({
          key: bigTransfer.objectKey,
          request: UploadRequest.cases.List.make({ uploadId: mpuId }),
        });
        const listed = yield* Effect.promise(async () => await send("GET", list.url));
        expect(listed.status).toBe(200);
        const partNumbers = [
          ...listed.body.toString("utf-8").matchAll(/<PartNumber>(?<n>\d+)<\/PartNumber>/gu),
        ].map((match) => match.groups?.n);
        expect(partNumbers).toEqual(["1", "2", "3"]);

        const complete = yield* api.SignUpload({
          key: bigTransfer.objectKey,
          request: UploadRequest.cases.Complete.make({ uploadId: mpuId }),
        });
        const completed = yield* Effect.promise(
          async () => await send("POST", complete.url, completeXml(etags), "application/xml"),
        );
        expect(completed.status).toBe(200);

        const ready = yield* finalize(api, bigId);
        expect(ready.status).toBe("ready");

        // Finalize sealed the key: the rogue upload was aborted and no new
        // upload can start, so the verified bytes are the only bytes.
        const replayed = yield* Effect.promise(
          async () =>
            await send("POST", rogueComplete.url, completeXml([rogueEtag]), "application/xml"),
        );
        expect(replayed.status).not.toBe(200);
        const reopened = yield* Effect.flip(
          api.SignUpload({
            key: bigTransfer.objectKey,
            request: UploadRequest.cases.Create.make({}),
          }),
        );
        expect(reopened._tag).toBe("UploadClosed");
        const expiresAt = yield* required(ready.expiresAt, "ready delivery has no expiresAt");
        const daysToExpiry = (expiresAt.getTime() - Date.now()) / 86_400_000;
        expect(daysToExpiry).toBeGreaterThan(2.5);
        expect(daysToExpiry).toBeLessThan(3.5);

        // Idempotent finalize and CreateDelivery replay.
        const again = yield* finalize(api, bigId);
        expect(again.status).toBe("ready");
        const replay = yield* api.CreateDelivery(newDelivery);
        expect(replay.id).toBe(deliveryId);
        expect(replay.link).toBe(delivery.link);
        const conflict = yield* Effect.flip(
          api.CreateDelivery({
            files: newDelivery.files.map((file, index) =>
              index === 0 ? { ...file, size: file.size + 1 } : file,
            ),
            id: newDelivery.id,
            retentionDays: newDelivery.retentionDays,
            title: newDelivery.title,
          }),
        );
        expect(conflict._tag).toBe("DeliveryConflict");

        // Anonymous link: downloads verify byte-for-byte, no session cookie.
        const token = LinkToken.make(delivery.link.slice("/d/".length));
        const shared = yield* anon.OpenLink({ token });
        expect(shared.files).toHaveLength(3);
        const digests = new Map([
          ["Ep31/small.txt", sha256(small)],
          ["Ep31/cam/big.bin", sha256(big)],
          ["Ep31/empty.txt", sha256(Buffer.alloc(0))],
        ]);
        yield* Effect.forEach(shared.files, (file) =>
          Effect.promise(async () => {
            const result = await send("GET", file.url);
            expect(result.status).toBe(200);
            expect(sha256(result.body)).toBe(digests.get(file.path));
            const basename = file.path.split("/").at(-1) ?? "";
            expect(result.headers.get("content-disposition") ?? "").toContain(basename);
          }),
        );

        const tampered = LinkToken.make(`${token.split(".")[0]}.${"A".repeat(43)}`);
        const badLink = yield* Effect.flip(anon.OpenLink({ token: tampered }));
        expect(badLink._tag).toBe("LinkNotFound");
      }).pipe(Effect.ensuring(cleanup(api, delivery.id)));
    }),
  );

  it.effect("signing rules · invalid uploads rejected on an open delivery", () =>
    Effect.gen(function* rules() {
      const { anon, api } = yield* Target;
      const delivery = yield* api.CreateDelivery({
        files: [
          {
            contentType: "application/octet-stream",
            id: TransferId.make(randomUUID()),
            lastModified: Date.now(),
            path: "pending.bin",
            size: 150 * MIB,
          },
        ],
        id: DeliveryId.make(randomUUID()),
        retentionDays: 1,
        title: "Pending",
      });
      yield* Effect.gen(function* rejected() {
        const key = delivery.transfers[0].objectKey;

        const part4 = yield* Effect.flip(
          api.SignUpload({
            key,
            request: UploadRequest.cases.Part.make({ partNumber: 4, uploadId: "x" }),
          }),
        );
        expect(part4._tag).toBe("InvalidUpload");

        const unknown = yield* Effect.flip(
          api.SignUpload({ key: "d/nope/nope", request: UploadRequest.cases.Create.make({}) }),
        );
        expect(unknown._tag).toBe("DeliveryNotFound");

        const link = yield* Effect.flip(
          anon.OpenLink({ token: LinkToken.make(delivery.link.slice("/d/".length)) }),
        );
        expect(link._tag).toBe("LinkNotReady");
      }).pipe(Effect.ensuring(cleanup(api, delivery.id)));
    }),
  );

  it.effect("pinned length · R2 refuses a body longer than the signed length", () =>
    Effect.gen(function* pinned() {
      const { api } = yield* Target;
      const part = partSize(128 * MIB);
      const file = (path: string, size: number) => ({
        contentType: "application/octet-stream",
        id: TransferId.make(randomUUID()),
        lastModified: Date.now(),
        path,
        size,
      });
      const delivery = yield* api.CreateDelivery({
        files: [file("exact.bin", 2 * part), file("one.bin", 1), file("short.bin", part + 10)],
        id: DeliveryId.make(randomUUID()),
        retentionDays: 1,
        title: "Pinned",
      });
      yield* Effect.gen(function* refused() {
        const transfer = (path: string) =>
          required(
            delivery.transfers.find((t) => t.path === path),
            `delivery is missing ${path}`,
          );
        const exact = yield* transfer("exact.bin");
        const one = yield* transfer("one.bin");
        const short = yield* transfer("short.bin");
        // Without the signed content-length header, fetch sends the body's own
        // length, which is what a tampering client controls.
        const errorCode = (body: Buffer) =>
          /<Code>(?<code>[^<]+)<\/Code>/u.exec(body.toString("utf-8"))?.groups?.code;

        // A 1-byte file declared at create: a 2-byte PUT is refused, 1 byte lands.
        const put = yield* api.SignUpload({
          key: one.objectKey,
          request: UploadRequest.cases.Put.make({}),
        });
        expect(put.headers).toEqual({ "content-length": "1", "if-none-match": "*" });
        const oversizedPut = yield* Effect.promise(
          async () =>
            await send("PUT", put.url, Buffer.from("ab"), undefined, { "if-none-match": "*" }),
        );
        expect({ code: errorCode(oversizedPut.body), status: oversizedPut.status }).toEqual({
          code: "SignatureDoesNotMatch",
          status: 403,
        });
        const exactPut = yield* Effect.promise(
          async () => await send("PUT", put.url, Buffer.from("a"), undefined, put.headers),
        );
        expect(exactPut.status).toBe(200);
        const afterOne = yield* finalize(api, one.id);
        expect(afterOne.transfers.find((t) => t.id === one.id)?.state).toBe("complete");

        // A short last part signs its own length: one byte over is refused.
        const shortId = yield* createUpload(api, short.objectKey);
        const lastPart = yield* api.SignUpload({
          key: short.objectKey,
          request: UploadRequest.cases.Part.make({ partNumber: 2, uploadId: shortId }),
        });
        expect(lastPart.headers).toEqual({ "content-length": "10" });
        const oversizedPart = yield* Effect.promise(
          async () => await send("PUT", lastPart.url, Buffer.alloc(11, 0x73)),
        );
        expect({ code: errorCode(oversizedPart.body), status: oversizedPart.status }).toEqual({
          code: "SignatureDoesNotMatch",
          status: 403,
        });
        yield* putPart(api, short.objectKey, shortId, 2, Buffer.alloc(10, 0x73));

        // A file of exactly two full parts uploads and finalizes as before.
        const bytes = Buffer.alloc(2 * part, 0x65);
        const exactId = yield* createUpload(api, exact.objectKey);
        const etags = yield* Effect.forEach([1, 2], (partNumber) =>
          putPart(
            api,
            exact.objectKey,
            exactId,
            partNumber,
            bytes.subarray((partNumber - 1) * part, partNumber * part),
          ),
        );
        const complete = yield* api.SignUpload({
          key: exact.objectKey,
          request: UploadRequest.cases.Complete.make({ uploadId: exactId }),
        });
        const completed = yield* Effect.promise(
          async () => await send("POST", complete.url, completeXml(etags), "application/xml"),
        );
        expect(completed.status).toBe(200);
        const afterExact = yield* finalize(api, exact.id);
        expect(afterExact.transfers.find((t) => t.id === exact.id)?.state).toBe("complete");
      }).pipe(Effect.ensuring(cleanup(api, delivery.id)));
    }),
  );

  it.effect("browser rules · security headers, and /rpc refuses cross-site POSTs", () =>
    Effect.gen(function* browserRules() {
      const { baseUrl } = yield* Target;
      const rpc = (headers: Record<string, string>) =>
        Effect.promise(
          async () =>
            await fetch(`${baseUrl}/rpc`, {
              body: "{}",
              headers: { "content-type": "application/json", ...headers },
              method: "POST",
            }),
        );
      // "/" is prerendered and served from public/_headers; "/deliveries" and
      // "/rpc" go through the Worker in src/middleware.ts.
      const pages = yield* Effect.forEach(["/", "/deliveries"], (path) =>
        Effect.promise(async () => await fetch(`${baseUrl}${path}`)),
      );
      const crossSite = yield* rpc({ "sec-fetch-site": "cross-site" });
      const sameSite = yield* rpc({ "sec-fetch-site": "same-site" });
      const otherOrigin = yield* rpc({ origin: "https://example.com" });
      const sameOrigin = yield* rpc({ origin: baseUrl, "sec-fetch-site": "same-origin" });

      for (const response of [...pages, crossSite]) {
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
      }
      expect([crossSite.status, sameSite.status, otherOrigin.status]).toEqual([403, 403, 403]);
      expect(sameOrigin.status).not.toBe(403);
    }),
  );

  it.effect("cancel · aborts remote multipart and closes signing", () =>
    Effect.gen(function* cancel() {
      const { api } = yield* Target;
      const deliveryId = DeliveryId.make(randomUUID());
      const delivery = yield* api.CreateDelivery({
        files: [
          {
            contentType: "application/octet-stream",
            id: TransferId.make(randomUUID()),
            lastModified: Date.now(),
            path: "junk.bin",
            size: 70 * MIB,
          },
        ],
        id: deliveryId,
        retentionDays: 3,
        title: "Cancelme",
      });
      yield* Effect.gen(function* aborted() {
        const key = delivery.transfers[0].objectKey;

        const create = yield* api.SignUpload({ key, request: UploadRequest.cases.Create.make({}) });
        const created = yield* Effect.promise(
          async () => await send("POST", create.url, new Uint8Array(0)),
        );
        expect(created.status).toBe(200);
        const mpuId = yield* required(
          uploadId(created.body),
          "CreateMultipartUpload returned no UploadId",
        );

        const part1 = yield* api.SignUpload({
          key,
          request: UploadRequest.cases.Part.make({ partNumber: 1, uploadId: mpuId }),
        });
        const put1 = yield* Effect.promise(
          async () => await send("PUT", part1.url, Buffer.alloc(partSize(70 * MIB), 0x63)),
        );
        expect(put1.status).toBe(200);

        const presigned2 = yield* api.SignUpload({
          key,
          request: UploadRequest.cases.Part.make({ partNumber: 2, uploadId: mpuId }),
        });

        const cancelled = yield* api.CancelDelivery({ deliveryId });
        expect(cancelled.status).toBe("cancelled");
        expect(cancelled.transfers[0].state).toBe("cancelled");

        // The URL signed before cancel is dead: the MPU was aborted remotely.
        // The body is part 2's signed length, so only the abort can refuse it.
        const orphan = yield* Effect.promise(
          async () =>
            await send("PUT", presigned2.url, Buffer.alloc(70 * MIB - partSize(70 * MIB), 0x78)),
        );
        expect(orphan.status).not.toBe(200);
        expect(orphan.body.toString("utf-8")).toContain("NoSuchUpload");

        const closed = yield* Effect.flip(
          api.SignUpload({ key, request: UploadRequest.cases.Create.make({}) }),
        );
        expect(closed._tag).toBe("UploadClosed");

        const again = yield* api.CancelDelivery({ deliveryId });
        expect(again.status).toBe("cancelled");
      }).pipe(Effect.ensuring(cleanup(api, delivery.id)));
    }),
  );
});

import { createHash, randomUUID } from "node:crypto";

import { expect, layer } from "@effect/vitest";
import { partSize } from "@tranzfer/contracts";
import type { NewDelivery } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
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
) => {
  const response = await fetch(url, {
    body,
    headers: contentType === undefined ? undefined : { "content-type": contentType },
    method,
  });
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

// R2 can take a moment to make a completed multipart object visible to HEAD;
// the web client retries NotUploaded with the same backoff.
const finalize = (api: Api, transferId: string) =>
  api.FinalizeTransfer({ transferId }).pipe(
    Effect.retry({
      schedule: Schedule.exponential("800 millis"),
      times: 3,
      while: (error) => error._tag === "NotUploaded",
    }),
  );

const cleanup = (api: Api, deliveryId: string) =>
  api.CancelDelivery({ deliveryId }).pipe(
    Effect.tapError((error) => Effect.logWarning(`cleanup cancel failed for ${deliveryId}`, error)),
    Effect.ignore,
  );

layer(Target.layer)("staging deliveries", (it) => {
  it.effect("lifecycle · upload, finalize and anonymous download", () =>
    Effect.gen(function* lifecycle() {
      const { anon, api } = yield* Target;

      const small = Buffer.alloc(8 * 1024, 0x61);
      const bigSize = 150 * MIB;
      const big = Buffer.alloc(bigSize, 0x62);
      const now = Date.now();
      const deliveryId = randomUUID();
      const smallId = randomUUID();
      const bigId = randomUUID();
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

        // Small file: single presigned PUT, then finalize.
        const put = yield* api.SignUpload({
          key: smallTransfer.objectKey,
          request: { _tag: "Put" },
        });
        const putResult = yield* Effect.promise(
          async () => await send("PUT", put.url, small, "text/plain"),
        );
        expect(putResult.status).toBe(200);

        const afterSmall = yield* finalize(api, smallId);
        expect(afterSmall.transfers.find((t) => t.id === smallId)?.state).toBe("complete");

        // Big file: multipart create, three signed part PUTs, list, complete.
        const create = yield* api.SignUpload({
          key: bigTransfer.objectKey,
          request: { _tag: "Create" },
        });
        const created = yield* Effect.promise(
          async () => await send("POST", create.url, new Uint8Array(0)),
        );
        expect(created.status).toBe(200);
        const mpuId = yield* required(
          uploadId(created.body),
          "CreateMultipartUpload returned no UploadId",
        );

        const part = partSize(bigSize);
        const etags = yield* Effect.forEach([1, 2, 3], (partNumber) =>
          Effect.gen(function* uploadPart() {
            const signed = yield* api.SignUpload({
              key: bigTransfer.objectKey,
              request: { _tag: "Part", partNumber, uploadId: mpuId },
            });
            const chunk = big.subarray((partNumber - 1) * part, partNumber * part);
            const result = yield* Effect.promise(async () => await send("PUT", signed.url, chunk));
            expect(result.status).toBe(200);
            return yield* required(
              result.headers.get("etag")?.replaceAll('"', ""),
              `part ${partNumber} returned no ETag`,
            );
          }),
        );

        const list = yield* api.SignUpload({
          key: bigTransfer.objectKey,
          request: { _tag: "List", uploadId: mpuId },
        });
        const listed = yield* Effect.promise(async () => await send("GET", list.url));
        expect(listed.status).toBe(200);
        const partNumbers = [
          ...listed.body.toString("utf-8").matchAll(/<PartNumber>(?<n>\d+)<\/PartNumber>/gu),
        ].map((match) => match.groups?.n);
        expect(partNumbers).toEqual(["1", "2", "3"]);

        const completeXml = `<CompleteMultipartUpload>${etags
          .map(
            (etag, index) =>
              `<Part><PartNumber>${index + 1}</PartNumber><ETag>"${etag}"</ETag></Part>`,
          )
          .join("")}</CompleteMultipartUpload>`;
        const complete = yield* api.SignUpload({
          key: bigTransfer.objectKey,
          request: { _tag: "Complete", uploadId: mpuId },
        });
        const completed = yield* Effect.promise(
          async () => await send("POST", complete.url, completeXml, "application/xml"),
        );
        expect(completed.status).toBe(200);

        const ready = yield* finalize(api, bigId);
        expect(ready.status).toBe("ready");
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
            ...newDelivery,
            files: newDelivery.files.map((file, index) =>
              index === 0 ? { ...file, size: file.size + 1 } : file,
            ),
          }),
        );
        expect(conflict._tag).toBe("DeliveryConflict");

        // Anonymous link: downloads verify byte-for-byte, no session cookie.
        const token = delivery.link.slice("/d/".length);
        const shared = yield* anon.OpenLink({ token });
        expect(shared.files).toHaveLength(2);
        const digests = new Map([
          ["Ep31/small.txt", sha256(small)],
          ["Ep31/cam/big.bin", sha256(big)],
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

        const tampered = `${token.split(".")[0]}.${"A".repeat(22)}`;
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
            id: randomUUID(),
            lastModified: Date.now(),
            path: "pending.bin",
            size: 150 * MIB,
          },
        ],
        id: randomUUID(),
        retentionDays: 1,
        title: "Pending",
      });
      yield* Effect.gen(function* rejected() {
        const key = delivery.transfers[0].objectKey;

        const put = yield* Effect.flip(api.SignUpload({ key, request: { _tag: "Put" } }));
        expect(put._tag).toBe("InvalidUpload");

        const part4 = yield* Effect.flip(
          api.SignUpload({
            key,
            request: { _tag: "Part", partNumber: 4, uploadId: "x" },
          }),
        );
        expect(part4._tag).toBe("InvalidUpload");

        const unknown = yield* Effect.flip(
          api.SignUpload({ key: "d/nope/nope", request: { _tag: "Put" } }),
        );
        expect(unknown._tag).toBe("DeliveryNotFound");

        const link = yield* Effect.flip(
          anon.OpenLink({ token: delivery.link.slice("/d/".length) }),
        );
        expect(link._tag).toBe("LinkNotReady");
      }).pipe(Effect.ensuring(cleanup(api, delivery.id)));
    }),
  );

  it.effect("cancel · aborts remote multipart and closes signing", () =>
    Effect.gen(function* cancel() {
      const { api } = yield* Target;
      const deliveryId = randomUUID();
      const delivery = yield* api.CreateDelivery({
        files: [
          {
            contentType: "application/octet-stream",
            id: randomUUID(),
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

        const create = yield* api.SignUpload({ key, request: { _tag: "Create" } });
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
          request: { _tag: "Part", partNumber: 1, uploadId: mpuId },
        });
        const put1 = yield* Effect.promise(
          async () => await send("PUT", part1.url, Buffer.alloc(partSize(70 * MIB), 0x63)),
        );
        expect(put1.status).toBe(200);

        const presigned2 = yield* api.SignUpload({
          key,
          request: { _tag: "Part", partNumber: 2, uploadId: mpuId },
        });

        const cancelled = yield* api.CancelDelivery({ deliveryId });
        expect(cancelled.status).toBe("cancelled");
        expect(cancelled.transfers[0].state).toBe("cancelled");

        // The URL signed before cancel is dead: the MPU was aborted remotely.
        const orphan = yield* Effect.promise(
          async () => await send("PUT", presigned2.url, Buffer.alloc(1024, 0x78)),
        );
        expect(orphan.status).not.toBe(200);
        expect(orphan.body.toString("utf-8")).toContain("NoSuchUpload");

        const closed = yield* Effect.flip(api.SignUpload({ key, request: { _tag: "Put" } }));
        expect(closed._tag).toBe("UploadClosed");

        const again = yield* api.CancelDelivery({ deliveryId });
        expect(again.status).toBe("cancelled");
      }).pipe(Effect.ensuring(cleanup(api, delivery.id)));
    }),
  );
});

import type { UploadRequest } from "@tranzfer/contracts";
import { Credentials, Endpoint, Presign, Region } from "@distilled.cloud/aws";
import * as S3 from "@distilled.cloud/aws/s3";
import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { Storage, StorageError, UPLOAD_URL_TTL } from "../implementation/storage";
import { Files } from "../resources";

// SAFETY: R2's S3 API signs against the pseudo-region "auto", which the AWS
// RegionName union does not include.
const region = "auto" as Region.RegionName;

// S3 DeleteObjects takes at most 1000 keys.
const DELETE_BATCH = 1000;

const noHeaders: Record<string, string> = {};

const uploadRequest = Match.type<UploadRequest>().pipe(
  Match.withReturnType<{
    headers: Record<string, string>;
    method: string;
    query: Record<string, string>;
  }>(),
  Match.tagsExhaustive({
    Complete: ({ uploadId }) => ({ headers: noHeaders, method: "POST", query: { uploadId } }),
    Create: () => ({ headers: noHeaders, method: "POST", query: { uploads: "" } }),
    List: ({ partNumberMarker, uploadId }) => ({
      headers: noHeaders,
      method: "GET",
      query: Object.fromEntries(
        partNumberMarker === undefined
          ? [["uploadId", uploadId]]
          : [
              ["part-number-marker", String(partNumberMarker)],
              ["uploadId", uploadId],
            ],
      ),
    }),
    Part: ({ partNumber, uploadId }) => ({
      headers: noHeaders,
      method: "PUT",
      query: { partNumber: String(partNumber), uploadId },
    }),
    // Signed in: the PUT may create the object but never replace it.
    Put: () => ({ headers: { "if-none-match": "*" }, method: "PUT", query: {} }),
  }),
);

interface R2Options {
  readonly accountId: Effect.Effect<string>;
  readonly bucket: Effect.Effect<string>;
  readonly tokenId: Effect.Effect<string>;
  readonly tokenValue: Effect.Effect<Redacted.Redacted>;
}

const make = (options: R2Options) =>
  Effect.gen(function* makeR2Storage() {
    const headObject = yield* S3.headObject;
    const listMultipartUploads = yield* S3.listMultipartUploads;
    const abortMultipartUpload = yield* S3.abortMultipartUpload;
    const deleteObjects = yield* S3.deleteObjects;
    const presignContext = yield* Effect.context<Credentials.Credentials | Region.Region>();

    const objectUrl = (key: string) =>
      Effect.map(
        Effect.all([options.accountId, options.bucket]),
        ([accountId, bucket]) =>
          new URL(
            `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
          ),
      );

    const presign = (
      method: string,
      url: URL,
      ttl: Duration.Duration,
      headers: Record<string, string> = noHeaders,
    ) =>
      Effect.gen(function* signUrl() {
        const now = yield* Clock.currentTimeMillis;
        const signed = yield* Presign.presignUrl({
          expiresIn: Duration.toSeconds(ttl),
          headers: Object.keys(headers).length === 0 ? undefined : headers,
          method,
          service: "s3",
          url: url.href,
        });
        return { expiresAt: new Date(now + Duration.toMillis(ttl)), headers, url: signed };
      }).pipe(Effect.provide(presignContext), Effect.orDie);

    const multipartUploads = (bucket: string, prefix: string) =>
      Stream.paginate(
        { keyMarker: Option.none<string>(), uploadIdMarker: Option.none<string>() },
        (markers) =>
          listMultipartUploads({
            Bucket: bucket,
            KeyMarker: Option.getOrUndefined(markers.keyMarker),
            Prefix: prefix,
            UploadIdMarker: Option.getOrUndefined(markers.uploadIdMarker),
          }).pipe(
            Effect.map(
              (page) =>
                [
                  page.Uploads ?? [],
                  page.IsTruncated === true
                    ? Option.some({
                        keyMarker: Option.fromNullishOr(page.NextKeyMarker),
                        uploadIdMarker: Option.fromNullishOr(page.NextUploadIdMarker),
                      })
                    : Option.none(),
                ] as const,
            ),
          ),
      );

    const abortAll = (bucket: string, prefix: string, matches: (key: string) => boolean) =>
      multipartUploads(bucket, prefix).pipe(
        Stream.runForEach((upload) =>
          upload.Key === undefined || upload.UploadId === undefined || !matches(upload.Key)
            ? Effect.void
            : abortMultipartUpload({
                Bucket: bucket,
                Key: upload.Key,
                UploadId: upload.UploadId,
              }).pipe(Effect.catchTag("NoSuchUpload", () => Effect.void)),
        ),
        Effect.mapError((cause) => new StorageError({ cause })),
      );

    return Storage.of({
      head: Effect.fn("Storage.head")(function* head(key: string) {
        const bucket = yield* options.bucket;
        return yield* headObject({ Bucket: bucket, Key: key }).pipe(
          Effect.map((output) =>
            Option.map(Option.fromNullishOr(output.ContentLength), (size) => ({
              etag: output.ETag,
              size,
            })),
          ),
          Effect.catchTag("NotFound", () => Effect.succeedNone),
          Effect.mapError((cause) => new StorageError({ cause })),
        );
      }),

      purge: Effect.fn("Storage.purge")(function* purge(prefix: string, keys: readonly string[]) {
        const bucket = yield* options.bucket;
        yield* abortAll(bucket, prefix, () => true);
        yield* Effect.forEach(
          Arr.chunksOf(keys, DELETE_BATCH),
          (chunk) =>
            deleteObjects({
              Bucket: bucket,
              Delete: { Objects: chunk.map((key) => ({ Key: key })), Quiet: true },
            }).pipe(
              // A 200 can still list keys that failed; quiet mode returns only those.
              Effect.filterOrFail(
                (result) => (result.Errors?.length ?? 0) === 0,
                (result) => result.Errors,
              ),
            ),
          { discard: true },
        ).pipe(Effect.mapError((cause) => new StorageError({ cause })));
      }),

      seal: Effect.fn("Storage.seal")(function* seal(key: string) {
        const bucket = yield* options.bucket;
        yield* abortAll(bucket, key, (found) => found === key);
      }),

      signDownload: Effect.fn("Storage.signDownload")(function* signDownload(
        key: string,
        filename: string,
        ttl: Duration.Duration,
      ) {
        const url = yield* objectUrl(key);
        const fallback = filename.replaceAll(/[^ -~]/gu, "_").replaceAll(/["\\]/gu, "_");
        url.searchParams.set(
          "response-content-disposition",
          `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        );
        return yield* presign("GET", url, ttl);
      }),

      signUpload: Effect.fn("Storage.signUpload")(function* signUpload(
        key: string,
        request: UploadRequest,
      ) {
        const url = yield* objectUrl(key);
        const { headers, method, query } = uploadRequest(request);
        for (const [name, value] of Object.entries(query)) {
          url.searchParams.set(name, value);
        }
        return yield* presign(method, url, UPLOAD_URL_TTL, headers);
      }),
    });
  });

/** Storage over R2's S3 API. Credential inputs are read lazily, once per isolate. */
export const r2Storage = (options: R2Options) =>
  Layer.unwrap(
    Effect.gen(function* r2StorageLayer() {
      // R2's S3 credentials are the token id and the SHA-256 hex of its value.
      const credentials = yield* Effect.cached(
        Effect.gen(function* resolveCredentials() {
          const [tokenId, tokenValue] = yield* Effect.all([options.tokenId, options.tokenValue]);
          const digest = yield* Effect.promise(
            async () =>
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(Redacted.value(tokenValue)),
              ),
          );
          return {
            accessKeyId: Redacted.make(tokenId),
            region,
            secretAccessKey: Redacted.make(Encoding.encodeHex(new Uint8Array(digest))),
            sessionToken: undefined,
          };
        }),
      );
      return Layer.effect(Storage, make(options)).pipe(
        Layer.provide([
          Layer.succeed(Credentials.Credentials, credentials),
          Layer.succeed(
            Endpoint.Endpoint,
            Effect.map(
              options.accountId,
              (accountId) => `https://${accountId}.r2.cloudflarestorage.com`,
            ),
          ),
          Region.of(region),
          FetchHttpClient.layer,
        ]),
      );
    }),
  );

// Binding values resolve per invocation, never at deploy time.
const lazy = <A>(value: Effect.Effect<A, never, RuntimeContext>) =>
  value.pipe(Effect.provide(RuntimeContext.phantom));

/** The Files bucket plus an account token scoped to it, as a Storage layer. */
export const filesStorage = Effect.gen(function* filesStorage() {
  const files = yield* Files;
  const token = yield* Cloudflare.ApiToken.AccountApiToken("FilesToken", {
    policies: [
      {
        effect: "allow",
        permissionGroups: [
          "Workers R2 Storage Bucket Item Read",
          "Workers R2 Storage Bucket Item Write",
        ],
        resources: Output.all(files.accountId, files.jurisdiction, files.bucketName).pipe(
          Output.map(([accountId, jurisdiction, bucketName]) => ({
            [`com.cloudflare.edge.r2.bucket.${accountId}_${jurisdiction}_${bucketName}`]: "*",
          })),
        ),
      },
    ],
  });
  return r2Storage({
    accountId: lazy(yield* files.accountId),
    bucket: lazy(yield* files.bucketName),
    tokenId: lazy(yield* token.tokenId),
    tokenValue: lazy(yield* token.value),
  });
});

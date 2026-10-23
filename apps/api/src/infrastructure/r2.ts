import type { UploadRequest } from "@tranzfer/contracts";
import { Credentials, Endpoint, Presign, Region } from "@distilled.cloud/aws";
import * as S3 from "@distilled.cloud/aws/s3";
import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Arr from "effect/Array";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { Storage, StorageError, UPLOAD_URL_TTL } from "../storage";
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

type BucketCredentials = Effect.Effect<Cloudflare.R2.S3CredentialsValue>;

const objectUrl = (credentials: BucketCredentials, key: string) =>
  Effect.map(
    credentials,
    ({ bucketName, endpoint }) =>
      new URL(`${endpoint}/${bucketName}/${key.split("/").map(encodeURIComponent).join("/")}`),
  );

const make = (credentials: BucketCredentials) =>
  Effect.gen(function* makeR2Storage() {
    const headObject = yield* S3.headObject;
    const listMultipartUploads = yield* S3.listMultipartUploads;
    const abortMultipartUpload = yield* S3.abortMultipartUpload;
    const deleteObjects = yield* S3.deleteObjects;
    const presignContext = yield* Effect.context<Credentials.Credentials | Region.Region>();

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
        const { bucketName: bucket } = yield* credentials;
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
        const { bucketName: bucket } = yield* credentials;
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
        const { bucketName: bucket } = yield* credentials;
        yield* abortAll(bucket, key, (found) => found === key);
      }),

      signDownload: Effect.fn("Storage.signDownload")(function* signDownload(
        key: string,
        filename: string,
        ttl: Duration.Duration,
      ) {
        const url = yield* objectUrl(credentials, key);
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
        contentLength: number | undefined,
      ) {
        const url = yield* objectUrl(credentials, key);
        const { headers, method, query } = uploadRequest(request);
        for (const [name, value] of Object.entries(query)) {
          url.searchParams.set(name, value);
        }
        return yield* presign(
          method,
          url,
          UPLOAD_URL_TTL,
          contentLength === undefined
            ? headers
            : { ...headers, "content-length": String(contentLength) },
        );
      }),
    });
  });

/** Storage over R2's S3 API. The credentials are read lazily, once per isolate. */
export const r2Storage = (binding: BucketCredentials) =>
  Layer.unwrap(
    Effect.gen(function* r2StorageLayer() {
      const credentials = yield* Effect.cached(binding);
      return Layer.effect(Storage, make(credentials)).pipe(
        Layer.provide([
          Layer.succeed(
            Credentials.Credentials,
            Effect.map(credentials, ({ accessKeyId, secretAccessKey }) => ({
              accessKeyId: Redacted.make(accessKeyId),
              region,
              secretAccessKey: Redacted.make(secretAccessKey),
              sessionToken: undefined,
            })),
          ),
          Layer.succeed(
            Endpoint.Endpoint,
            Effect.map(credentials, ({ endpoint }) => endpoint),
          ),
          Region.of(region),
          FetchHttpClient.layer,
        ]),
      );
    }),
  );

/** The Files bucket and S3 credentials scoped to it, as a Storage layer. */
export const filesStorage = Effect.gen(function* filesStorage() {
  const credentials = yield* Cloudflare.R2.S3Credentials(Files, { access: "read-write" });
  // The Storage layer is built at cold start, so its type can't carry the
  // RuntimeContext marker. The credentials are read only per request.
  return r2Storage(credentials.pipe(Effect.provide(RuntimeContext.phantom)));
});

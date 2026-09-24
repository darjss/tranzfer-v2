import type { UploadRequest } from "@tranzfer/contracts";
import { Credentials, Endpoint, Presign, Region } from "@distilled.cloud/aws";
import * as S3 from "@distilled.cloud/aws/s3";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { StorageError } from "./storage-error";

// SAFETY: R2's S3 API signs against the pseudo-region "auto", which the AWS
// RegionName union does not include.
const r2Region = "auto" as Region.RegionName;

// Uppy signs right before each request; downloads get an hour because
// validity is checked at request start, so long downloads still finish.
const UPLOAD_URL_TTL_SECONDS = 900;
const DOWNLOAD_URL_TTL_SECONDS = 3600;

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

const needsDeployedStage = (op: StorageError["op"]) =>
  Effect.fail(new StorageError({ cause: "Uploads need a deployed stage", op }));

export class Storage extends Context.Service<
  Storage,
  {
    readonly signUpload: (
      key: string,
      request: UploadRequest,
    ) => Effect.Effect<SignedUrl, StorageError>;
    readonly signDownload: (
      key: string,
      filename: string,
    ) => Effect.Effect<SignedUrl, StorageError>;
    readonly head: (
      key: string,
    ) => Effect.Effect<Option.Option<{ readonly size: number }>, StorageError>;
    readonly abortUploads: (key: string) => Effect.Effect<void, StorageError>;
    readonly remove: (key: string) => Effect.Effect<void, StorageError>;
  }
>()("tranzfer/Storage") {
  static readonly make = (options: {
    readonly accountId: Effect.Effect<string>;
    readonly bucket: Effect.Effect<string>;
    readonly tokenId: Effect.Effect<string>;
    readonly tokenValue: Effect.Effect<Redacted.Redacted>;
  }) =>
    Layer.unwrap(
      Effect.gen(function* storageLayer() {
        // R2 S3 credentials from an API token: accessKeyId is the token id,
        // secretAccessKey the lowercase hex SHA-256 of the token value.
        // Resolved once per isolate; the accessors read Worker bindings, so
        // nothing touches them at deploy time.
        const credentials = yield* Effect.cached(
          Effect.gen(function* resolveCredentials() {
            const [tokenId, tokenValue] = yield* Effect.all([options.tokenId, options.tokenValue], {
              concurrency: "unbounded",
            });
            const digest = yield* Effect.promise(
              async () =>
                await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(Redacted.value(tokenValue)),
                ),
            );
            const hex = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            return {
              accessKeyId: Redacted.make(tokenId),
              region: r2Region,
              secretAccessKey: Redacted.make(hex),
              sessionToken: undefined,
            };
          }),
        );

        const objectUrl = Effect.fnUntraced(function* objectUrl(key: string) {
          const [accountId, bucket] = yield* Effect.all([options.accountId, options.bucket], {
            concurrency: "unbounded",
          });
          return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`;
        });

        return Layer.effect(
          Storage,
          Effect.gen(function* make() {
            // `yield* op` captures the provided context and hands back a
            // requirement-free call function (distilled's OperationMethod).
            const headObject = yield* S3.headObject;
            const listMultipartUploads = yield* S3.listMultipartUploads;
            const abortMultipartUpload = yield* S3.abortMultipartUpload;
            const deleteObject = yield* S3.deleteObject;
            const presignContext = yield* Effect.context<Credentials.Credentials | Region.Region>();

            const presign = Effect.fnUntraced(function* presign(args: {
              readonly expiresIn: number;
              readonly method: string;
              readonly url: string;
            }) {
              const signed = yield* Presign.presignUrl({
                expiresIn: args.expiresIn,
                method: args.method,
                service: "s3",
                url: args.url,
              });
              return {
                expiresAt: new Date(Date.now() + args.expiresIn * 1000),
                url: signed,
              };
            }, Effect.provide(presignContext));

            return Storage.of({
              abortUploads: Effect.fn("Storage.abortUploads")((key) =>
                Effect.gen(function* abortUploads() {
                  const bucket = yield* options.bucket;
                  let keyMarker: string | undefined;
                  let uploadIdMarker: string | undefined;
                  do {
                    const page = yield* listMultipartUploads({
                      Bucket: bucket,
                      KeyMarker: keyMarker,
                      Prefix: key,
                      UploadIdMarker: uploadIdMarker,
                    });
                    for (const upload of page.Uploads ?? []) {
                      if (upload.Key === key && upload.UploadId !== undefined) {
                        yield* abortMultipartUpload({
                          Bucket: bucket,
                          Key: key,
                          UploadId: upload.UploadId,
                        }).pipe(
                          // Retries after a partial abort must stay safe.
                          Effect.catchTag("NoSuchUpload", () => Effect.void),
                        );
                      }
                    }
                    keyMarker = page.IsTruncated === true ? page.NextKeyMarker : undefined;
                    uploadIdMarker =
                      page.IsTruncated === true ? page.NextUploadIdMarker : undefined;
                  } while (keyMarker !== undefined || uploadIdMarker !== undefined);
                }).pipe(
                  Effect.mapError((cause) => new StorageError({ cause, op: "abortUploads" })),
                ),
              ),
              head: Effect.fn("Storage.head")((key) =>
                Effect.gen(function* head() {
                  const bucket = yield* options.bucket;
                  const object = yield* headObject({ Bucket: bucket, Key: key }).pipe(
                    Effect.map((output) =>
                      output.ContentLength === undefined
                        ? Option.none<{ readonly size: number }>()
                        : Option.some({ size: output.ContentLength }),
                    ),
                    Effect.catchTag("NotFound", () =>
                      Effect.succeed(Option.none<{ readonly size: number }>()),
                    ),
                  );
                  return object;
                }).pipe(Effect.mapError((cause) => new StorageError({ cause, op: "head" }))),
              ),
              remove: Effect.fn("Storage.remove")((key) =>
                Effect.gen(function* remove() {
                  const bucket = yield* options.bucket;
                  yield* deleteObject({ Bucket: bucket, Key: key });
                }).pipe(Effect.mapError((cause) => new StorageError({ cause, op: "remove" }))),
              ),
              signDownload: Effect.fn("Storage.signDownload")((key, filename) =>
                Effect.gen(function* signDownload() {
                  const url = new URL(yield* objectUrl(key));
                  const fallback = filename.replaceAll(/[^ -~]/gu, "_").replaceAll(/["\\]/gu, "_");
                  url.searchParams.set(
                    "response-content-disposition",
                    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                  );
                  return yield* presign({
                    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
                    method: "GET",
                    url: url.href,
                  });
                }).pipe(
                  Effect.mapError((cause) => new StorageError({ cause, op: "signDownload" })),
                ),
              ),
              signUpload: Effect.fn("Storage.signUpload")((key, request) =>
                Effect.gen(function* signUpload() {
                  const url = new URL(yield* objectUrl(key));
                  let method: string;
                  switch (request._tag) {
                    case "Put": {
                      method = "PUT";
                      break;
                    }
                    case "Create": {
                      method = "POST";
                      url.searchParams.set("uploads", "");
                      break;
                    }
                    case "Part": {
                      method = "PUT";
                      url.searchParams.set("partNumber", String(request.partNumber));
                      url.searchParams.set("uploadId", request.uploadId);
                      break;
                    }
                    case "List": {
                      method = "GET";
                      url.searchParams.set("uploadId", request.uploadId);
                      break;
                    }
                    case "Complete": {
                      method = "POST";
                      url.searchParams.set("uploadId", request.uploadId);
                      break;
                    }
                    default: {
                      return yield* Effect.die(new Error("Unknown upload request tag"));
                    }
                  }
                  return yield* presign({
                    expiresIn: UPLOAD_URL_TTL_SECONDS,
                    method,
                    url: url.href,
                  });
                }).pipe(Effect.mapError((cause) => new StorageError({ cause, op: "signUpload" }))),
              ),
            });
          }),
        ).pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(Credentials.Credentials, credentials),
              Layer.succeed(
                Endpoint.Endpoint,
                options.accountId.pipe(
                  Effect.map((accountId) => `https://${accountId}.r2.cloudflarestorage.com`),
                ),
              ),
              Region.of(r2Region),
              FetchHttpClient.layer,
            ),
          ),
        );
      }),
    );

  // Local dev stages have no real token or bucket, so every operation
  // reports that uploads need a deployed stage.
  static readonly unavailable = Layer.succeed(
    Storage,
    Storage.of({
      abortUploads: () => needsDeployedStage("abortUploads"),
      head: () => needsDeployedStage("head"),
      remove: () => needsDeployedStage("remove"),
      signDownload: () => needsDeployedStage("signDownload"),
      signUpload: () => needsDeployedStage("signUpload"),
    }),
  );
}

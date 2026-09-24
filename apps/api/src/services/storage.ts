import { StorageUnavailable } from "@tranzfer/contracts";
import type { UploadRequest } from "@tranzfer/contracts";
import { Credentials, Endpoint, Presign, Region } from "@distilled.cloud/aws";
import * as S3 from "@distilled.cloud/aws/s3";
import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { Files } from "../resources";
import { StorageError } from "./storage-error";

// SAFETY: R2's S3 API signs against the pseudo-region "auto", which the AWS
// RegionName union does not include.
const r2Region = "auto" as Region.RegionName;

// Uppy signs right before each request. Download expiry is set per call so
// a URL never outlives the link that issued it.
const UPLOAD_URL_TTL_SECONDS = 900;

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

// Storage failures reach the client as StorageUnavailable; the real cause is
// logged here, never sent.
export const toStorageUnavailable =
  (label: string) =>
  <A, R>(effect: Effect.Effect<A, StorageError, R>): Effect.Effect<A, StorageUnavailable, R> =>
    effect.pipe(
      Effect.tapError((error) => Effect.logError(label, error.cause)),
      Effect.mapError(
        () => new StorageUnavailable({ message: "Storage is unavailable. Try again." }),
      ),
    );

const needsDeployedStage = (op: StorageError["op"]) =>
  Effect.fail(new StorageError({ cause: "Uploads need a deployed stage", op }));

export class Storage extends Context.Service<
  Storage,
  {
    readonly available: boolean;
    readonly signUpload: (
      key: string,
      request: UploadRequest,
    ) => Effect.Effect<SignedUrl, StorageError>;
    readonly signDownload: (
      key: string,
      filename: string,
      expiresInSeconds: number,
    ) => Effect.Effect<SignedUrl, StorageError>;
    readonly head: (
      key: string,
    ) => Effect.Effect<
      Option.Option<{ readonly etag: string | undefined; readonly size: number }>,
      StorageError
    >;
    readonly abortUploads: (key: string) => Effect.Effect<void, StorageError>;
    readonly remove: (key: string) => Effect.Effect<void, StorageError>;
  }
>()("tranzfer/Storage") {
  static readonly deployed = Effect.gen(function* deployed() {
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
    return Storage.make({
      accountId: (yield* files.accountId).pipe(Effect.provide(RuntimeContext.phantom)),
      bucket: (yield* files.bucketName).pipe(Effect.provide(RuntimeContext.phantom)),
      tokenId: (yield* token.tokenId).pipe(Effect.provide(RuntimeContext.phantom)),
      tokenValue: (yield* token.value).pipe(Effect.provide(RuntimeContext.phantom)),
    });
  });

  static readonly make = (options: {
    readonly accountId: Effect.Effect<string>;
    readonly bucket: Effect.Effect<string>;
    readonly tokenId: Effect.Effect<string>;
    readonly tokenValue: Effect.Effect<Redacted.Redacted>;
  }) =>
    Layer.unwrap(
      Effect.gen(function* storageLayer() {
        // accessKeyId is the token id and secretAccessKey its SHA-256 hex;
        // resolved once per isolate so bindings are not read at deploy time.
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
                  let truncated = true;
                  while (truncated) {
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
                    keyMarker = page.NextKeyMarker;
                    uploadIdMarker = page.NextUploadIdMarker;
                    truncated = page.IsTruncated === true;
                  }
                }).pipe(
                  Effect.mapError((cause) => new StorageError({ cause, op: "abortUploads" })),
                ),
              ),
              available: true,
              head: Effect.fn("Storage.head")((key) =>
                Effect.gen(function* head() {
                  const bucket = yield* options.bucket;
                  const object = yield* headObject({ Bucket: bucket, Key: key }).pipe(
                    Effect.map((output) =>
                      output.ContentLength === undefined
                        ? Option.none<{
                            readonly etag: string | undefined;
                            readonly size: number;
                          }>()
                        : Option.some({ etag: output.ETag, size: output.ContentLength }),
                    ),
                    Effect.catchTag("NotFound", () =>
                      Effect.succeed(
                        Option.none<{ readonly etag: string | undefined; readonly size: number }>(),
                      ),
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
              signDownload: Effect.fn("Storage.signDownload")((key, filename, expiresInSeconds) =>
                Effect.gen(function* signDownload() {
                  const url = new URL(yield* objectUrl(key));
                  const fallback = filename.replaceAll(/[^ -~]/gu, "_").replaceAll(/["\\]/gu, "_");
                  url.searchParams.set(
                    "response-content-disposition",
                    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                  );
                  return yield* presign({
                    expiresIn: expiresInSeconds,
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
                  const { method, query } = Match.valueTags(request, {
                    Complete: (r) => ({
                      method: "POST",
                      query: { uploadId: r.uploadId },
                    }),
                    Create: () => ({ method: "POST", query: { uploads: "" } }),
                    List: (r) => ({ method: "GET", query: { uploadId: r.uploadId } }),
                    Part: (r) => ({
                      method: "PUT",
                      query: { partNumber: String(r.partNumber), uploadId: r.uploadId },
                    }),
                    Put: () => ({ method: "PUT", query: {} }),
                  });
                  for (const [name, value] of Object.entries(query)) {
                    url.searchParams.set(name, value);
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

  static readonly unavailable = Layer.succeed(
    Storage,
    Storage.of({
      abortUploads: () => needsDeployedStage("abortUploads"),
      available: false,
      head: () => needsDeployedStage("head"),
      remove: () => needsDeployedStage("remove"),
      signDownload: () => needsDeployedStage("signDownload"),
      signUpload: () => needsDeployedStage("signUpload"),
    }),
  );
}

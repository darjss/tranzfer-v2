import { Credentials, Endpoint, Presign, Region } from "@distilled.cloud/aws";
import * as S3 from "@distilled.cloud/aws/s3";
import { Environment } from "effect-cf";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { SigningError } from "./signing-error";

// SAFETY: R2's S3 API signs against the pseudo-region "auto", which the AWS
// RegionName union does not include.
const r2Region = "auto" as Region.RegionName;

export class Signing extends Context.Service<
  Signing,
  {
    readonly createMultipart: (args: {
      readonly bucket: string;
      readonly key: string;
    }) => Effect.Effect<string, SigningError>;
    readonly presignPart: (args: {
      readonly bucket: string;
      readonly key: string;
      readonly partNumber: number;
      readonly uploadId: string;
    }) => Effect.Effect<string, SigningError>;
    readonly listParts: (args: {
      readonly bucket: string;
      readonly key: string;
      readonly uploadId: string;
    }) => Effect.Effect<S3.ListPartsOutput, SigningError>;
    readonly abortMultipart: (args: {
      readonly bucket: string;
      readonly key: string;
      readonly uploadId: string;
    }) => Effect.Effect<void, SigningError>;
  }
>()("tranzfer/Signing") {
  static readonly make = (options: {
    readonly accessKeyId: string;
    readonly accountId: string;
    readonly secretAccessKey: string;
  }) => {
    const endpoint = `https://${options.accountId}.r2.cloudflarestorage.com`;
    return Layer.effect(
      Signing,
      Effect.gen(function* make() {
        // `yield* op` captures the provided context and hands back a
        // requirement-free call function (distilled's OperationMethod).
        const createMultipartUpload = yield* S3.createMultipartUpload;
        const listParts = yield* S3.listParts;
        const abortMultipartUpload = yield* S3.abortMultipartUpload;
        const presignContext = yield* Effect.context<Credentials.Credentials | Region.Region>();

        return Signing.of({
          abortMultipart: Effect.fn("Signing.abortMultipart")((args) =>
            abortMultipartUpload({
              Bucket: args.bucket,
              Key: args.key,
              UploadId: args.uploadId,
            }).pipe(
              Effect.asVoid,
              Effect.mapError((cause) => new SigningError({ cause, op: "abortMultipart" })),
            ),
          ),
          createMultipart: Effect.fn("Signing.createMultipart")((args) =>
            createMultipartUpload({ Bucket: args.bucket, Key: args.key }).pipe(
              Effect.map(({ UploadId }) => UploadId),
              Effect.mapError((cause) => new SigningError({ cause, op: "createMultipart" })),
              Effect.filterOrFail(
                (id): id is string => id !== undefined,
                () => new SigningError({ cause: "missing UploadId", op: "createMultipart" }),
              ),
            ),
          ),
          listParts: Effect.fn("Signing.listParts")((args) =>
            listParts({ Bucket: args.bucket, Key: args.key, UploadId: args.uploadId }).pipe(
              Effect.mapError((cause) => new SigningError({ cause, op: "listParts" })),
            ),
          ),
          presignPart: Effect.fn("Signing.presignPart")((args) =>
            Effect.suspend(() => {
              // Keys can contain "+", "?", "&", spaces; encode each segment
              // like distilled's own presignS3Url or the query corrupts.
              const url = new URL(
                `${endpoint}/${args.bucket}/${args.key.split("/").map(encodeURIComponent).join("/")}`,
              );
              url.searchParams.set("partNumber", String(args.partNumber));
              url.searchParams.set("uploadId", args.uploadId);
              return Presign.presignUrl({ method: "PUT", service: "s3", url: url.href });
            }).pipe(
              Effect.provide(presignContext),
              Effect.mapError((cause) => new SigningError({ cause, op: "presignPart" })),
            ),
          ),
        });
      }),
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          FetchHttpClient.layer,
          Region.of(r2Region),
          Endpoint.of(endpoint),
          Credentials.fromCredentials(
            {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
            r2Region,
          ),
        ),
      ),
    );
  };

  static readonly layer = Layer.unwrap(
    Effect.gen(function* layer() {
      const env = yield* Environment.WorkerEnvironment;
      const creds = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          R2_ACCESS_KEY_ID: Schema.NonEmptyString,
          R2_ACCOUNT_ID: Schema.NonEmptyString,
          R2_SECRET_ACCESS_KEY: Schema.NonEmptyString,
        }),
      )(env);
      return Signing.make({
        accessKeyId: creds.R2_ACCESS_KEY_ID,
        accountId: creds.R2_ACCOUNT_ID,
        secretAccessKey: creds.R2_SECRET_ACCESS_KEY,
      });
    }),
  );
}

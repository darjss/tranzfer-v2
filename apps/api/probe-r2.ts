import * as S3 from "@distilled.cloud/aws/s3";
import { Presign } from "@distilled.cloud/aws";
import * as Effect from "effect/Effect";

import { make } from "./src/r2.ts";

// This file runs under Node (tsx), outside the workers-typed tsconfig scope.
declare const process: { env: Record<string, string | undefined> };

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (accountId === undefined || accessKeyId === undefined || secretAccessKey === undefined) {
  throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY required");
}

const bucket = process.env.R2_BUCKET ?? "tranzfer-files-production";
const key = `s3-probe/${crypto.randomUUID()}`;

const layers = make({ accessKeyId, accountId, secretAccessKey });

const program = Effect.gen(function* probe() {
  const { UploadId } = yield* S3.createMultipartUpload({ Bucket: bucket, Key: key });
  if (UploadId === undefined) {
    throw new Error("createMultipartUpload returned no UploadId");
  }
  console.log("createMultipartUpload ok");

  const partUrl = yield* Presign.presignUrl({
    method: "PUT",
    service: "s3",
    url: `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}?partNumber=1&uploadId=${UploadId}`,
  });
  console.log("presigned UploadPart url:", partUrl.slice(0, partUrl.indexOf("?")));

  const put = yield* Effect.tryPromise(
    async () => await fetch(partUrl, { body: "probe-part-body", method: "PUT" }),
  );
  if (!put.ok) {
    throw new Error(
      `presigned PUT failed: ${put.status} ${yield* Effect.promise(async () => await put.text())}`,
    );
  }
  const etag = put.headers.get("etag");
  console.log("presigned UploadPart PUT ok, etag:", etag);

  const listed = yield* S3.listParts({ Bucket: bucket, Key: key, UploadId });
  console.log("listParts:", JSON.stringify(listed.Parts));

  yield* S3.abortMultipartUpload({ Bucket: bucket, Key: key, UploadId });
  console.log("abortMultipartUpload ok");
}).pipe(Effect.provide(layers));

await Effect.runPromise(program);

import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { Signing } from "./src/services/signing.ts";

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

const runtime = ManagedRuntime.make(Signing.make({ accessKeyId, accountId, secretAccessKey }));

const program = Effect.gen(function* probe() {
  const signing = yield* Signing;

  const uploadId = yield* signing.createMultipart({ bucket, key });
  console.log("createMultipartUpload ok");

  // abort in ensuring: a failed presign/PUT/listParts must not leave a
  // dangling multipart upload in R2
  yield* Effect.gen(function* parts() {
    const partUrl = yield* signing.presignPart({ bucket, key, partNumber: 1, uploadId });
    console.log("presigned UploadPart url:", partUrl.slice(0, partUrl.indexOf("?")));

    const put = yield* Effect.tryPromise(
      async () => await fetch(partUrl, { body: "probe-part-body", method: "PUT" }),
    );
    if (!put.ok) {
      throw new Error(
        `presigned PUT failed: ${put.status} ${yield* Effect.promise(async () => await put.text())}`,
      );
    }
    console.log("presigned UploadPart PUT ok, etag:", put.headers.get("etag"));

    const listed = yield* signing.listParts({ bucket, key, uploadId });
    console.log("listParts:", JSON.stringify(listed.Parts));
  }).pipe(
    Effect.ensuring(
      signing.abortMultipart({ bucket, key, uploadId }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            console.log("abortMultipartUpload ok");
          }),
        ),
        Effect.orDie,
      ),
    ),
  );
});

await runtime.runPromise(program);

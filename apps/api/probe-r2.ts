import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { Signing } from "./src/services/signing.ts";

const key = `s3-probe/${crypto.randomUUID()}`;

const program = Effect.gen(function* probe() {
  const signing = yield* Signing;
  const bucket = yield* Config.String("R2_BUCKET").pipe(
    Config.withDefault("tranzfer-files-production"),
  );

  const uploadId = yield* signing.createMultipart({ bucket, key });
  console.log("createMultipartUpload ok");

  // abort in ensuring: a failed presign/PUT/listParts must not leave a
  // dangling multipart upload in R2
  yield* Effect.gen(function* parts() {
    const partUrl = yield* signing.presignPart({ bucket, key, partNumber: 1, uploadId });
    console.log("presigned UploadPart url:", partUrl.slice(0, partUrl.indexOf("?")));

    const put = yield* Effect.promise(async () => {
      const res = await fetch(partUrl, { body: "probe-part-body", method: "PUT" });
      if (!res.ok) {
        throw new Error(`presigned PUT failed: ${res.status} ${await res.text()}`);
      }
      return res;
    });
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

const runtime = ManagedRuntime.make(Signing.layer);

try {
  await runtime.runPromise(program);
} finally {
  await runtime.dispose();
}

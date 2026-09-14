# Effect architecture research

Status: notes for [issue #7](https://github.com/darjss/tranzfer-v2/issues/7). Not an implementation plan.
Research date: 2026-09-14.

Tranzfer’s job is reliable 100–350 GB transfer. R2 multipart state is remote
truth. IndexedDB/D1 hold recovery identity. Uppy moves bytes browser → R2. Effect
can own the control plane. It cannot own transfer lifetime. Fiber interruption
must never imply `AbortMultipartUpload`.

Local clones used for this note (btca sandbox):

- `~/.btca/agent/sandbox/distilled-aws` (sparse clone of alchemy-run/distilled)
- `~/.btca/agent/sandbox/effect-cf` (danieljvdm/effect-cf)
- `~/.btca/agent/sandbox/effect-cloudflare` (dmmulroy/effect-cloudflare, earlier mix-up)
- `~/.btca/agent/sandbox/alchemy-effect`

## Distilled S3 (`@distilled.cloud/aws`)

Source: [alchemy-run/distilled](https://github.com/alchemy-run/distilled),
package `@distilled.cloud/aws`. Sam Goodwin / Alchemy. Smithy-generated
Effect client. Worker and bun export maps exist. Generated `s3.ts` is ~841 KB.

This is an **S3 HTTP client**, not a Cloudflare R2 binding wrapper. It needs
access key, secret, region, and an endpoint override for R2:

```ts
import { Layer } from "effect";
import * as S3 from "@distilled.cloud/aws/s3";
import { Credentials, Endpoint, Region } from "@distilled.cloud/aws";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

const R2S3 = Layer.mergeAll(
  FetchHttpClient.layer,
  Region.of("auto"),
  Endpoint.of("https://<ACCOUNT_ID>.r2.cloudflarestorage.com"),
  Credentials.fromCredentials({
    accessKeyId: "...",
    secretAccessKey: "...",
  }),
);
```

`Endpoint` is documented for LocalStack and S3-compatible stores
(`packages/aws/src/endpoint.ts`). `presignS3Url` uses that custom endpoint as
path-style `{endpoint}/{bucket}/{key}` (`packages/aws/src/presign.ts`). Generic
`presignUrl` can sign an arbitrary URL including `uploadId` / `partNumber`
query params. `content-type` can be pinned into the signature.

S3 operations patched for errors include the multipart set STACK.md already
requires: `createMultipartUpload`, `uploadPart`, `listParts`,
`completeMultipartUpload` (via the generated client), `abortMultipartUpload`,
`listMultipartUploads` (`packages/aws/patches/s3.json`).

**Use Distilled S3 for control-plane S3 API calls that the Worker binding
cannot do, or that must be signed for the browser.**

- `ListParts` / `listMultipartUploads` (authoritative remote parts; Workers
  `R2Bucket` does not expose ListParts).
- Presigned GET/PUT/HEAD/DELETE, and presigned UploadPart URLs for Uppy.
- Create / abort / complete over S3 if you choose one protocol for MPU identity.

**Do not** `S3.uploadPart` or `S3.putObject` the file body from `apps/api`.
That pulls hundreds of gigabytes through the Worker. STACK.md already forbids
that. Distilled would still be the wrong tool for byte transport even if the
types look nice.

`@distilled.cloud/cloudflare` is the Cloudflare **account REST API**
(`listBuckets` and similar). It is not `env.BUCKET`. Do not use it for object
I/O.

Prove against real R2 before depending on it: path-style vs virtual-hosted
URLs, `region: auto`, checksum/middleware defaults, and that a Distilled
presigned UploadPart URL is accepted by Uppy’s S3 plugin. If presign is
awkward, keep Distilled for ListParts and use `aws4fetch` (Cloudflare’s own
R2 example) for signing.

## `danieljvdm/effect-cf`

Source: [danieljvdm/effect-cf](https://github.com/danieljvdm/effect-cf),
package `effect-cf` **0.41.1**. Published. Peer `effect` `^4.0.0-rc.112`, same
RC Tranzfer already pins in `infra`. Uses Vite+, Oxlint, Bun. This is the
library meant by “effect-cloudflare,” not Dillon’s unpublished Effect 3
scratch.

It wraps **native Worker bindings**, not the S3 HTTP API. `R2.Tag` +
`Reports.layer({ binding: "REPORTS" })` reads `env.REPORTS` through
`WorkerEnvironment` and returns an `R2Client`:

- `head` / `get` / `put` / `delete` / `list`
- `createMultipartUpload` / `resumeMultipartUpload`
- wrapped `uploadPart` / `complete` / `abort`
- one `R2OperationError` (`binding`, `operation`, `cause`), plus spans
- `rawUnsafe` to escape to the native bucket

There is **no ListParts** and **no presign**. `resumeMultipartUpload` is a
sync wrap of `bucket.resumeMultipartUpload(key, uploadId)`. That rebuilds a
handle. It does not ask R2 which parts exist.

The repo’s own Cloudflare R2 skill states the Workers API cannot mint
presigned URLs and that local Miniflare has no multipart / no presign. Those
need the S3 API (`region: 'auto'`, account endpoint). Distilled S3 or
`aws4fetch` still own that half.

`uploadPart` still takes a body in the Worker. Same product ban as Distilled
`uploadPart`. Binding `complete` / `abort` / `head` / `delete` are fine once
etags are known.

The README outbox example `archive.put(payload.key, payload.body)` is a
small Durable Object snapshot, not a 350 GB browser upload. Do not copy that
shape onto Uppy.

Intended Tranzfer split: `effect-cf` hosts Effect HTTP / Effect RPC
(`Worker.make` / `makeFetchHandler`, `fetch` returning
`HttpServerResponse` or a native `Response`). Distilled S3 is the R2
client. Do not take `R2.Tag`. `effect-cf` `rpc:` is **Cloudflare Workers
RPC** (service-binding class methods), not `effect/unstable/rpc`. Browser
and desktop still use Effect RPC over HTTP.

`dmmulroy/effect-cloudflare` is the same binding idea on Effect 3, private,
unpublished. Ignore it.

## How they fit together

```text
browser / Uppy          bytes + part PUT to presigned R2 URLs
                        never through the API Worker

apps/api control plane
  effect-cf             Worker.make / makeFetchHandler (HTTP + Effect RPC)
  Distilled S3          all R2 object/multipart control (ListParts, presign,
                        create/abort/complete). No effect-cf R2.Tag.

@distilled.cloud/cloudflare   account REST only (createBucket, CORS, …)
```

Do not confuse `effect-cf` `rpc:` (Cloudflare Workers RPC stubs) with
`RpcServer.toHttpEffect` (Effect RPC over HTTP for the web/desktop client).
Neither path should carry file bytes.

## Sources

- [alchemy-run/distilled](https://github.com/alchemy-run/distilled)
- [packages/aws/src/presign.ts](https://github.com/alchemy-run/distilled/blob/main/packages/aws/src/presign.ts)
- [packages/aws/src/endpoint.ts](https://github.com/alchemy-run/distilled/blob/main/packages/aws/src/endpoint.ts)
- [packages/aws/patches/s3.json](https://github.com/alchemy-run/distilled/blob/main/packages/aws/patches/s3.json)
- [danieljvdm/effect-cf](https://github.com/danieljvdm/effect-cf)
- `packages/effect-cf/src/R2.ts` in the local clone
- [dmmulroy/effect-cloudflare](https://github.com/dmmulroy/effect-cloudflare) (not the intended repo)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare aws4fetch example](https://developers.cloudflare.com/r2/examples/aws/aws4fetch/)
- `docs/RELIABILITY.md`, `docs/STACK.md`, issue #7

import { Credentials, Endpoint, Region } from "@distilled.cloud/aws";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

// SAFETY: R2's S3 API signs against the pseudo-region "auto", which the AWS
// RegionName union does not include.
const r2Region = "auto" as Region.RegionName;

export const make = (options: {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}) =>
  Layer.mergeAll(
    FetchHttpClient.layer,
    Region.of(r2Region),
    Endpoint.of(`https://${options.accountId}.r2.cloudflarestorage.com`),
    Credentials.fromCredentials(
      {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      r2Region,
    ),
  );

import type { SignedUrl, UploadRequest } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

/** How long a signed upload URL stays usable. Uppy signs right before each request. */
export const UPLOAD_URL_TTL = Duration.minutes(15);

/** Not a wire error: callers map it to StorageUnavailable or let it die. */
export class StorageError extends Data.TaggedError("StorageError")<{ readonly cause: unknown }> {}

export interface StoredObject {
  readonly etag: string | undefined;
  readonly size: number;
}

/** Object storage. Signing is local crypto; head, seal and purge reach the network. */
export class Storage extends Context.Service<
  Storage,
  {
    readonly signUpload: (key: string, request: UploadRequest) => Effect.Effect<SignedUrl>;
    readonly signDownload: (
      key: string,
      filename: string,
      ttl: Duration.Duration,
    ) => Effect.Effect<SignedUrl>;
    readonly head: (key: string) => Effect.Effect<Option.Option<StoredObject>, StorageError>;
    /** Aborts every open multipart upload on `key`, so no signed URL can write it again. */
    readonly seal: (key: string) => Effect.Effect<void, StorageError>;
    /** Aborts multipart uploads under `prefix` and deletes `keys`. Safe to repeat. */
    readonly purge: (prefix: string, keys: readonly string[]) => Effect.Effect<void, StorageError>;
  }
>()("tranzfer/Storage") {}

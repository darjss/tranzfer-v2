import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const DeliveryId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("DeliveryId"));
export type DeliveryId = typeof DeliveryId.Type;

export const TransferId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("TransferId"));
export type TransferId = typeof TransferId.Type;

export const RetentionDays = Schema.Literals([1, 3, 7, 14]);
export type RetentionDays = typeof RetentionDays.Type;
export const defaultRetentionDays: RetentionDays = 3;

/** The contract's file cap; D1's bound-parameter limit is handled server-side. */
export const maxFiles = 1000;
/**
 * The longest one name in a path, in UTF-8 bytes. ext4, xfs and btrfs stop
 * there, and the other disks allow at least as much, so any name that fits
 * lands anywhere. The path never reaches an R2 key (that is `d/<delivery>/<transfer>`).
 */
export const maxNameBytes = 255;
export const maxPathBytes = 1024;
export const maxTitleLength = 200;

// This package's lib has no TextEncoder. A lone surrogate counts 3, as its
// replacement character encodes.
const byteLength = (text: string) => {
  let total = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) {
      total += 1;
    } else if (code < 0x8_00) {
      total += 2;
    } else {
      total += code < 0x1_00_00 ? 3 : 4;
    }
  }
  return total;
};

export const NewFile = Schema.Struct({
  contentType: Schema.NullOr(Schema.String.check(Schema.isMaxLength(255))),
  id: TransferId,
  lastModified: Schema.Int,
  path: Schema.String,
  size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export interface NewFile extends Schema.Schema.Type<typeof NewFile> {}

/**
 * The sender picks every id, so a retried create is a replay rather than a
 * duplicate. What a file count and its paths may be is `checkFiles`, not the
 * schema, so a refusal reaches the client as `DeliveryRefused` and not as a
 * decode failure.
 */
export const NewDelivery = Schema.Struct({
  files: Schema.Array(NewFile).check(
    Schema.isMinLength(1),
    Schema.makeFilter(
      (files) =>
        new Set(files.map((file) => file.id)).size === files.length || "file ids must be unique",
    ),
  ),
  id: DeliveryId,
  retentionDays: RetentionDays,
  title: Schema.Trim.check(Schema.isBetweenLength(1, maxTitleLength)),
});
export interface NewDelivery extends Schema.Schema.Type<typeof NewDelivery> {}

export const DeliveryStatus = Schema.Literals(["open", "ready", "cancelled", "expired"]);
export type DeliveryStatus = typeof DeliveryStatus.Type;

export const TransferState = Schema.Literals(["uploading", "finalizing", "complete", "cancelled"]);
export type TransferState = typeof TransferState.Type;

export const Transfer = Schema.Struct({
  id: TransferId,
  objectKey: Schema.String,
  path: Schema.String,
  size: Schema.Int,
  state: TransferState,
});
export interface Transfer extends Schema.Schema.Type<typeof Transfer> {}

/**
 * What the recipient's browser has reported, for the sender only. Bytes go
 * from storage straight to the recipient, so the server never sees a download;
 * only the folder save reports a finished file. Anything else stays "started".
 */
export const DeliveryDownload = Schema.Struct({
  filesSaved: Schema.Int,
  lastAt: Schema.DateFromString,
  startedAt: Schema.DateFromString,
});
export interface DeliveryDownload extends Schema.Schema.Type<typeof DeliveryDownload> {}

export const Delivery = Schema.Struct({
  createdAt: Schema.DateFromString,
  download: Schema.NullOr(DeliveryDownload),
  expiresAt: Schema.NullOr(Schema.DateFromString),
  id: DeliveryId,
  link: Schema.String,
  retentionDays: RetentionDays,
  status: DeliveryStatus,
  title: Schema.String,
  transfers: Schema.Array(Transfer),
});
export interface Delivery extends Schema.Schema.Type<typeof Delivery> {}

/** The id is taken by a delivery or transfer whose contents differ from this request. */
export class DeliveryConflict extends Schema.TaggedError<DeliveryConflict>()(
  "DeliveryConflict",
  {},
) {}

/** Missing, or owned by someone else; the two look the same. */
export class DeliveryNotFound extends Schema.TaggedError<DeliveryNotFound>()(
  "DeliveryNotFound",
  {},
) {}

/**
 * The files can't be sent as picked, and sending again won't change that. The
 * reason carries the numbers; `checkFiles` is the one place that decides it.
 * `PathUnsafe`: a backslash, a control character, or an empty, `.` or `..`
 * folder name. `DuplicatePath`: two paths that differ only by case.
 */
export class DeliveryRefused extends Schema.TaggedError<DeliveryRefused>()("DeliveryRefused", {
  reason: Schema.Union([
    Schema.TaggedStruct("TooManyFiles", { count: Schema.Int, max: Schema.Int }),
    Schema.TaggedStruct("NameTooLong", { bytes: Schema.Int, max: Schema.Int, name: Schema.String }),
    Schema.TaggedStruct("PathTooLong", { bytes: Schema.Int, max: Schema.Int, path: Schema.String }),
    Schema.TaggedStruct("PathUnsafe", { path: Schema.String }),
    Schema.TaggedStruct("DuplicatePath", { path: Schema.String }),
  ]),
}) {}

const firstRefusal = (files: readonly { readonly path: string }[]) => {
  if (files.length > maxFiles) {
    return { _tag: "TooManyFiles", count: files.length, max: maxFiles } as const;
  }
  const seen = new Set<string>();
  for (const { path } of files) {
    if (path.startsWith("/") || path.includes("\\") || /\p{Cc}/u.test(path)) {
      return { _tag: "PathUnsafe", path } as const;
    }
    for (const name of path.split("/")) {
      if (name === "" || name === "." || name === "..") {
        return { _tag: "PathUnsafe", path } as const;
      }
      const bytes = byteLength(name);
      if (bytes > maxNameBytes) {
        return { _tag: "NameTooLong", bytes, max: maxNameBytes, name } as const;
      }
    }
    const bytes = byteLength(path);
    if (bytes > maxPathBytes) {
      return { _tag: "PathTooLong", bytes, max: maxPathBytes, path } as const;
    }
    // Case-variant paths would collide on the recipient's disk.
    if (seen.has(path.toLowerCase())) {
      return { _tag: "DuplicatePath", path } as const;
    }
    seen.add(path.toLowerCase());
  }
  return null;
};

/** The browser runs this before creating anything and the API again on every create. */
export const checkFiles = (files: readonly { readonly path: string }[]) => {
  const reason = firstRefusal(files);
  return reason === null ? Effect.void : Effect.fail(new DeliveryRefused({ reason }));
};

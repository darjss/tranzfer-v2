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

/** The last name in a delivery path: the file name, without its folders. */
export const basename = (path: string) => path.split("/").at(-1) ?? path;

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

/** What the sender calls a delivery; the recipient sees it as the page heading. */
export const DeliveryTitle = Schema.Trim.check(Schema.isBetweenLength(1, maxTitleLength));

/** A short message for the recipient, shown as plain text. Empty means none. */
export const DeliveryNote = Schema.Trim.check(Schema.isMaxLength(500));

export const NewFile = Schema.Struct({
  contentType: Schema.NullOr(Schema.String.check(Schema.isMaxLength(255))),
  id: TransferId,
  // A Date's range: a larger value is an Invalid Date the insert rejects.
  lastModified: Schema.Int.check(Schema.isBetween({ maximum: 8_640_000_000_000_000, minimum: 0 })),
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
  title: DeliveryTitle,
});
export interface NewDelivery extends Schema.Schema.Type<typeof NewDelivery> {}

/** What the delivery table stores. `expired` is derived on read from `expiresAt`. */
export const StoredDeliveryStatus = Schema.Literals(["open", "ready", "cancelled"]);

export const DeliveryStatus = Schema.Literals([...StoredDeliveryStatus.literals, "expired"]);
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

/** Who sent a delivery that came in through a request link. Email is optional. */
export const DeliveryUploader = Schema.Struct({
  email: Schema.NullOr(Schema.String),
  name: Schema.String,
});

export const Delivery = Schema.Struct({
  createdAt: Schema.DateFromString,
  download: Schema.NullOr(DeliveryDownload),
  expiresAt: Schema.NullOr(Schema.DateFromString),
  hasPassword: Schema.Boolean,
  id: DeliveryId,
  link: Schema.String,
  note: Schema.String,
  retentionDays: RetentionDays,
  status: DeliveryStatus,
  title: Schema.String,
  transfers: Schema.Array(Transfer),
  /** Null for a delivery the owner sent. */
  uploader: Schema.NullOr(DeliveryUploader),
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

export const DeliveryRefusal = Schema.TaggedUnion({
  DuplicatePath: { path: Schema.String },
  NameTooLong: { bytes: Schema.Int, max: Schema.Int, name: Schema.String },
  PathTooLong: { bytes: Schema.Int, max: Schema.Int, path: Schema.String },
  PathUnsafe: { path: Schema.String },
  TooManyFiles: { count: Schema.Int, max: Schema.Int },
});

/**
 * The files can't be sent as picked, and sending again won't change that. The
 * reason carries the numbers; `checkFiles` is the one place that decides it.
 * `PathUnsafe`: a backslash, a control character, or an empty, `.` or `..`
 * folder name. `DuplicatePath`: two paths that differ only by case.
 */
export class DeliveryRefused extends Schema.TaggedError<DeliveryRefused>()("DeliveryRefused", {
  reason: DeliveryRefusal,
}) {}

// Bidirectional controls reorder how a name displays. Zero-width joiners stay: emoji and several scripts need them.
const bidiControl = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

const firstRefusal = (files: readonly { readonly path: string }[]) => {
  if (files.length > maxFiles) {
    return DeliveryRefusal.cases.TooManyFiles.make({ count: files.length, max: maxFiles });
  }
  const seen = new Set<string>();
  for (const { path } of files) {
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      /\p{Cc}/u.test(path) ||
      bidiControl.test(path)
    ) {
      return DeliveryRefusal.cases.PathUnsafe.make({ path });
    }
    for (const name of path.split("/")) {
      if (name === "" || name === "." || name === "..") {
        return DeliveryRefusal.cases.PathUnsafe.make({ path });
      }
      const bytes = byteLength(name);
      if (bytes > maxNameBytes) {
        return DeliveryRefusal.cases.NameTooLong.make({ bytes, max: maxNameBytes, name });
      }
    }
    const bytes = byteLength(path);
    if (bytes > maxPathBytes) {
      return DeliveryRefusal.cases.PathTooLong.make({ bytes, max: maxPathBytes, path });
    }
    // Case-variant paths would collide on the recipient's disk.
    if (seen.has(path.toLowerCase())) {
      return DeliveryRefusal.cases.DuplicatePath.make({ path });
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

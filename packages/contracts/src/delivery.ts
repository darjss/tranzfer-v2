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

// Recipient-disk safe paths: forward slashes only, no traversal, no control
// characters, and segments that fit a filename.
export const RelativePath = Schema.String.check(
  Schema.isBetweenLength(1, 1024),
  Schema.makeFilter((value) => {
    if (value.startsWith("/") || value.includes("\\")) {
      return "path must use forward slashes and stay relative";
    }
    if (/\p{Cc}/u.test(value)) {
      return "path must not contain control characters";
    }
    for (const segment of value.split("/")) {
      if (segment.length === 0 || segment === "." || segment === "..") {
        return "path segments must be non-empty and not . or ..";
      }
      if (segment.length > 255) {
        return "path segments must be at most 255 characters";
      }
    }
    return true;
  }),
);

export const NewFile = Schema.Struct({
  contentType: Schema.NullOr(Schema.String.check(Schema.isMaxLength(255))),
  id: TransferId,
  lastModified: Schema.Int,
  path: RelativePath,
  size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export interface NewFile extends Schema.Schema.Type<typeof NewFile> {}

/** The sender picks every id, so a retried create is a replay rather than a duplicate. */
export const NewDelivery = Schema.Struct({
  files: Schema.Array(NewFile).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(maxFiles),
    // Case-variant paths would collide on the recipient's disk.
    Schema.makeFilter(
      (files) =>
        new Set(files.map((file) => file.path.toLowerCase())).size === files.length ||
        "file paths must be unique case-insensitively",
    ),
    Schema.makeFilter(
      (files) =>
        new Set(files.map((file) => file.id)).size === files.length || "file ids must be unique",
    ),
  ),
  id: DeliveryId,
  retentionDays: RetentionDays,
  title: Schema.Trim.check(Schema.isBetweenLength(1, 200)),
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

export const Delivery = Schema.Struct({
  createdAt: Schema.DateFromString,
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

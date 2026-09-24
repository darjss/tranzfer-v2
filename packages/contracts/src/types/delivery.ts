import * as Schema from "effect/Schema";

export const RetentionDays = Schema.Literals([1, 3, 7, 14]);
export const defaultRetentionDays = 3;

const MIB = 1024 * 1024;
const MAX_PARTS = 10_000;

// 64 MiB stands until the 10 GB gate benchmark.
export const partSize = (size: number) =>
  Math.max(64 * MIB, Math.ceil(size / MAX_PARTS / MIB) * MIB);
export const usesMultipart = (size: number) => size > partSize(size);
export const partCount = (size: number) => Math.ceil(size / partSize(size));

// Recipient-disk safe paths: forward slashes only, no traversal, no control
// characters, and segments that fit a filename.
const RelativePathSchema = Schema.String.check(
  Schema.isLengthBetween(1, 1024),
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
export { RelativePathSchema as RelativePath };
export type RelativePath = typeof RelativePathSchema.Type;

const NewFileSchema = Schema.Struct({
  contentType: Schema.NullOr(Schema.String.check(Schema.isMaxLength(255))),
  id: Schema.String.check(Schema.isUUID()),
  lastModified: Schema.Int,
  path: RelativePathSchema,
  size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export { NewFileSchema as NewFile };
export type NewFile = typeof NewFileSchema.Type;

const NewDeliverySchema = Schema.Struct({
  files: Schema.Array(NewFileSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(1000),
    // Case-variant paths would collide on the recipient's disk.
    Schema.makeFilter(
      (files) =>
        new Set(files.map((file) => file.path.toLowerCase())).size === files.length ||
        "file paths must be unique case-insensitively",
    ),
  ),
  id: Schema.String.check(Schema.isUUID()),
  retentionDays: RetentionDays,
  title: Schema.Trim.check(Schema.isLengthBetween(1, 200)),
});
export { NewDeliverySchema as NewDelivery };
export type NewDelivery = typeof NewDeliverySchema.Type;

export const DeliveryStatus = Schema.Literals(["open", "ready", "cancelled", "expired"]);
export const TransferState = Schema.Literals(["uploading", "finalizing", "complete", "cancelled"]);

const TransferSchema = Schema.Struct({
  id: Schema.String,
  objectKey: Schema.String,
  path: Schema.String,
  size: Schema.Int,
  state: TransferState,
});
export { TransferSchema as Transfer };
export type Transfer = typeof TransferSchema.Type;

export class Delivery extends Schema.Class<Delivery>("Delivery")({
  createdAt: Schema.DateFromString,
  expiresAt: Schema.NullOr(Schema.DateFromString),
  id: Schema.String,
  link: Schema.String,
  retentionDays: RetentionDays,
  status: DeliveryStatus,
  title: Schema.String,
  transfers: Schema.Array(TransferSchema),
}) {}

const SharedDeliverySchema = Schema.Struct({
  expiresAt: Schema.NullOr(Schema.DateFromString),
  files: Schema.Array(Schema.Struct({ path: Schema.String, size: Schema.Int, url: Schema.String })),
  senderName: Schema.String,
  title: Schema.String,
});
export { SharedDeliverySchema as SharedDelivery };
export type SharedDelivery = typeof SharedDeliverySchema.Type;

import * as Schema from "effect/Schema";

export const SharedFile = Schema.Struct({
  path: Schema.String,
  size: Schema.Int,
  url: Schema.String,
});
export interface SharedFile extends Schema.Schema.Type<typeof SharedFile> {}

/** What a recipient sees. Download URLs never outlive the link. */
export const SharedDelivery = Schema.Struct({
  expiresAt: Schema.NullOr(Schema.DateFromString),
  files: Schema.Array(SharedFile),
  note: Schema.String,
  senderName: Schema.String,
  title: Schema.String,
});
export interface SharedDelivery extends Schema.Schema.Type<typeof SharedDelivery> {}

/** A download the recipient's browser reports. The server cannot see bytes move, so it only hears this. */
export const DownloadEvent = Schema.Literals(["started", "saved"]);
export type DownloadEvent = typeof DownloadEvent.Type;

/** Unknown, revoked, cancelled and bad-signature links all look the same. */
export class LinkNotFound extends Schema.TaggedError<LinkNotFound>()("LinkNotFound", {}) {}

export class LinkNotReady extends Schema.TaggedError<LinkNotReady>()("LinkNotReady", {
  senderName: Schema.String,
  title: Schema.String,
}) {}

export class LinkExpired extends Schema.TaggedError<LinkExpired>()("LinkExpired", {
  expiredAt: Schema.DateFromString,
  title: Schema.String,
}) {}

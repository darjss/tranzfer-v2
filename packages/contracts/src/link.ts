import * as Schema from "effect/Schema";

/** A shared link's or file request's credential, `${linkId}.${hmac}`. Only the API mints one. */
export const LinkToken = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand("LinkToken"));
export type LinkToken = typeof LinkToken.Type;

/** Proof that the holder typed a link's password. Only the API mints one. */
export const UnlockToken = Schema.String.pipe(Schema.brand("UnlockToken"));
export type UnlockToken = typeof UnlockToken.Type;

/** What anyone holding a link sends: its token, plus the unlock when it has a password. */
export const LinkAccess = Schema.Struct({ token: LinkToken, unlock: Schema.optional(UnlockToken) });
export type LinkAccess = typeof LinkAccess.Type;

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

export const passwordLength = { max: 128, min: 8 } as const;

/** A link password. Spaces count, so the length is the only rule. */
export const LinkPassword = Schema.String.check(
  Schema.isBetweenLength(passwordLength.min, passwordLength.max),
);

/** The link has a password and the request carried no valid unlock. Names the sender, never the files. */
export class LinkLocked extends Schema.TaggedError<LinkLocked>()("LinkLocked", {
  senderName: Schema.String,
}) {}

export class WrongPassword extends Schema.TaggedError<WrongPassword>()("WrongPassword", {}) {}

/** Proof of a right password, scoped to one link and good until `expiresAt`. */
export const Unlocked = Schema.Struct({
  expiresAt: Schema.DateFromString,
  unlock: UnlockToken,
});
export interface Unlocked extends Schema.Schema.Type<typeof Unlocked> {}

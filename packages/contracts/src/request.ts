import * as Schema from "effect/Schema";

import {
  DeliveryId,
  DeliveryStatus,
  NewDelivery,
  RetentionDays,
  Transfer,
  TransferId,
} from "./delivery";
import { EmailAddress } from "./interest";

export const RequestId = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("RequestId"));
export type RequestId = typeof RequestId.Type;

// A delivery made through a request is titled "<title> from <name>", and a
// delivery title holds 200, so these two leave room for the joining word.
export const RequestTitle = Schema.Trim.check(Schema.isBetweenLength(1, 120));
export const UploaderName = Schema.Trim.check(Schema.isBetweenLength(1, 60));

/** Plain text for the uploader. Empty means none. */
export const RequestInstructions = Schema.Trim.check(Schema.isMaxLength(1000));

export const NewFileRequest = Schema.Struct({
  instructions: RequestInstructions,
  /** Total bytes the request may receive. Null leaves only the owner's space. */
  maxBytes: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  /** How long it accepts uploads, and how long each finished upload is kept. */
  retentionDays: RetentionDays,
  title: RequestTitle,
});
export interface NewFileRequest extends Schema.Schema.Type<typeof NewFileRequest> {}

export const FileRequestStatus = Schema.Literals(["open", "closed", "expired"]);
export type FileRequestStatus = typeof FileRequestStatus.Type;

/** A request as its owner sees it. */
export const FileRequest = Schema.Struct({
  createdAt: Schema.DateFromString,
  expiresAt: Schema.DateFromString,
  id: RequestId,
  instructions: Schema.String,
  link: Schema.String,
  maxBytes: Schema.NullOr(Schema.Int),
  /** Bytes in its uploads that were not cancelled. */
  receivedBytes: Schema.Int,
  retentionDays: RetentionDays,
  status: FileRequestStatus,
  title: Schema.String,
  /** Uploads that were not cancelled. */
  uploads: Schema.Int,
});
export interface FileRequest extends Schema.Schema.Type<typeof FileRequest> {}

/** What the uploader sees before choosing files. */
export const OpenedRequest = Schema.Struct({
  expiresAt: Schema.DateFromString,
  instructions: Schema.String,
  ownerName: Schema.String,
  title: Schema.String,
});
export interface OpenedRequest extends Schema.Schema.Type<typeof OpenedRequest> {}

/**
 * One upload session through a request. The uploader picks every id, as a
 * sender does, so a retried create replays. The title and retention come from
 * the request.
 */
export const NewRequestUpload = Schema.Struct({
  /** Null when the uploader left it out. */
  email: Schema.NullOr(EmailAddress),
  files: NewDelivery.fields.files,
  id: DeliveryId,
  name: UploaderName,
  token: Schema.String,
});
export interface NewRequestUpload extends Schema.Schema.Type<typeof NewRequestUpload> {}

/**
 * A delivery as the uploader sees it: its own files and their state, and not
 * the owner's link to it.
 */
export const RequestUpload = Schema.Struct({
  id: DeliveryId,
  status: DeliveryStatus,
  title: Schema.String,
  transfers: Schema.Array(Transfer),
});
export interface RequestUpload extends Schema.Schema.Type<typeof RequestUpload> {}

/** Delivery ids the uploader's browser remembers; only this request's come back. */
export const RequestUploadsPayload = Schema.Struct({
  deliveryIds: Schema.Array(DeliveryId).check(Schema.isMaxLength(50)),
  token: Schema.String,
});

export const RequestTransferPayload = Schema.Struct({
  token: Schema.String,
  transferId: TransferId,
});

/** Unknown, tampered, closed and expired request links all look the same. */
export class RequestNotFound extends Schema.TaggedError<RequestNotFound>()("RequestNotFound", {}) {}

/**
 * The request or its owner has no room for these files. The uploader is not
 * told which, or how much space the owner has.
 */
export class RequestFull extends Schema.TaggedError<RequestFull>()("RequestFull", {}) {}

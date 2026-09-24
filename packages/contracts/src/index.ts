import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { Authenticated } from "./auth";
import { Unauthorized } from "./errors/auth";
import { DeliveryConflict } from "./errors/delivery-conflict";
import { DeliveryNotFound } from "./errors/delivery-not-found";
import { InvalidUpload } from "./errors/invalid-upload";
import { LinkExpired } from "./errors/link-expired";
import { LinkNotFound } from "./errors/link-not-found";
import { LinkNotReady } from "./errors/link-not-ready";
import { NotUploaded } from "./errors/not-uploaded";
import { StorageUnavailable } from "./errors/storage-unavailable";
import { UploadClosed } from "./errors/upload-closed";
import { ProbeFailed } from "./errors/infra";
import { Principal } from "./types/auth";
import { Delivery, NewDelivery, SharedDelivery } from "./types/delivery";
import { UploadRequest } from "./types/upload";

export { Authenticated, CurrentPrincipal } from "./auth";
export { Unauthorized } from "./errors/auth";
export { AuthenticationUnavailable } from "./errors/authentication-unavailable";
export { DeliveryConflict } from "./errors/delivery-conflict";
export { DeliveryNotFound } from "./errors/delivery-not-found";
export { InvalidUpload } from "./errors/invalid-upload";
export { LinkExpired } from "./errors/link-expired";
export { LinkNotFound } from "./errors/link-not-found";
export { LinkNotReady } from "./errors/link-not-ready";
export { NotUploaded } from "./errors/not-uploaded";
export { StorageUnavailable } from "./errors/storage-unavailable";
export { UploadClosed } from "./errors/upload-closed";
export { ProbeFailed } from "./errors/infra";
export { Principal } from "./types/auth";
export {
  defaultRetentionDays,
  Delivery,
  DeliveryStatus,
  NewDelivery,
  NewFile,
  partCount,
  partSize,
  RelativePath,
  RetentionDays,
  SharedDelivery,
  TransferState,
  usesMultipart,
} from "./types/delivery";
export { UploadRequest } from "./types/upload";

export class Api extends RpcGroup.make(
  Rpc.make("Health", { success: Schema.Struct({ ok: Schema.Literal(true) }) }),
  Rpc.make("Infra", {
    error: ProbeFailed,
    success: Schema.Struct({ d1: Schema.Boolean, r2: Schema.Boolean, s3: Schema.Boolean }),
  }),
  Rpc.make("Me", { error: Unauthorized, success: Principal }).middleware(Authenticated),
  Rpc.make("CreateDelivery", {
    error: DeliveryConflict,
    payload: NewDelivery,
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("Deliveries", { success: Schema.Array(Delivery) }).middleware(Authenticated),
  Rpc.make("SignUpload", {
    error: Schema.Union([DeliveryNotFound, InvalidUpload, StorageUnavailable, UploadClosed]),
    payload: Schema.Struct({ key: Schema.String, request: UploadRequest }),
    success: Schema.Struct({ expiresAt: Schema.DateFromString, url: Schema.String }),
  }).middleware(Authenticated),
  Rpc.make("FinalizeTransfer", {
    error: Schema.Union([
      DeliveryNotFound,
      InvalidUpload,
      NotUploaded,
      StorageUnavailable,
      UploadClosed,
    ]),
    payload: Schema.Struct({ transferId: Schema.String }),
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("CancelDelivery", {
    error: Schema.Union([DeliveryNotFound, StorageUnavailable]),
    payload: Schema.Struct({ deliveryId: Schema.String }),
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("OpenLink", {
    error: Schema.Union([LinkExpired, LinkNotFound, LinkNotReady, StorageUnavailable]),
    payload: Schema.Struct({ token: Schema.String }),
    success: SharedDelivery,
  }),
) {}

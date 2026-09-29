import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { Authenticated, Principal, Unauthorized } from "./auth";
import {
  Delivery,
  DeliveryConflict,
  DeliveryId,
  DeliveryNotFound,
  NewDelivery,
  TransferId,
} from "./delivery";
import { LinkExpired, LinkNotFound, LinkNotReady, SharedDelivery } from "./link";
import {
  InvalidUpload,
  NotUploaded,
  SignedUrl,
  SignUploadPayload,
  StorageUnavailable,
  UploadClosed,
} from "./upload";

export class Api extends RpcGroup.make(
  Rpc.make("Me", { error: Unauthorized, success: Principal }).middleware(Authenticated),
  Rpc.make("CreateDelivery", {
    error: DeliveryConflict,
    payload: NewDelivery,
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("Deliveries", { success: Schema.Array(Delivery) }).middleware(Authenticated),
  Rpc.make("CancelDelivery", {
    error: DeliveryNotFound,
    payload: Schema.Struct({ deliveryId: DeliveryId }),
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("SignUpload", {
    error: Schema.Union([DeliveryNotFound, InvalidUpload, UploadClosed]),
    payload: SignUploadPayload,
    success: SignedUrl,
  }).middleware(Authenticated),
  Rpc.make("FinalizeTransfer", {
    error: Schema.Union([
      DeliveryNotFound,
      InvalidUpload,
      NotUploaded,
      StorageUnavailable,
      UploadClosed,
    ]),
    payload: Schema.Struct({ transferId: TransferId }),
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("OpenLink", {
    error: Schema.Union([LinkExpired, LinkNotFound, LinkNotReady]),
    payload: Schema.Struct({ token: Schema.String }),
    success: SharedDelivery,
  }),
) {}

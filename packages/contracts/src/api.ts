import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { Authenticated, AuthenticationUnavailable, Principal, Unauthorized } from "./auth";
import {
  AccessCodeInput,
  AccessCodeRefused,
  BillingSummary,
  BillingUnavailable,
  OverPlanLimit,
  PaidPlanId,
  PlanGrant,
  RateLimited,
  RetentionNotInPlan,
} from "./billing";
import {
  Delivery,
  DeliveryConflict,
  DeliveryId,
  DeliveryNotFound,
  NewDelivery,
  TransferId,
} from "./delivery";
import { InterestJoined, JoinInterestPayload } from "./interest";
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
    error: Schema.Union([DeliveryConflict, OverPlanLimit, RateLimited, RetentionNotInPlan]),
    payload: NewDelivery,
    success: Delivery,
  }).middleware(Authenticated),
  Rpc.make("Deliveries", { success: Schema.Array(Delivery) }).middleware(Authenticated),
  Rpc.make("CancelDelivery", {
    error: DeliveryNotFound,
    payload: Schema.Struct({ deliveryId: DeliveryId }),
    success: Delivery,
  }).middleware(Authenticated),
  // Hides ended deliveries from the sender's list. Live ones are left alone.
  // The dashboard lists at most 50, so one call never needs more.
  Rpc.make("ClearDeliveries", {
    payload: Schema.Struct({ deliveryIds: Schema.Array(DeliveryId).check(Schema.isMaxLength(50)) }),
  }).middleware(Authenticated),
  Rpc.make("SignUpload", {
    error: Schema.Union([DeliveryNotFound, InvalidUpload, RateLimited, UploadClosed]),
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
  Rpc.make("GetBilling", { success: BillingSummary }).middleware(Authenticated),
  Rpc.make("StartCheckout", {
    error: BillingUnavailable,
    payload: Schema.Struct({ plan: PaidPlanId }),
    success: Schema.Struct({ url: Schema.String }),
  }).middleware(Authenticated),
  Rpc.make("OpenBillingPortal", {
    error: BillingUnavailable,
    success: Schema.Struct({ url: Schema.String }),
  }).middleware(Authenticated),
  Rpc.make("RedeemCode", {
    error: Schema.Union([AccessCodeRefused, RateLimited]),
    payload: Schema.Struct({ code: AccessCodeInput }),
    success: PlanGrant,
  }).middleware(Authenticated),
  // Public: the pricing page asks before anyone has an account.
  Rpc.make("JoinInterest", {
    error: Schema.Union([AuthenticationUnavailable, RateLimited, Unauthorized]),
    payload: JoinInterestPayload,
    success: InterestJoined,
  }),
  Rpc.make("OpenLink", {
    error: Schema.Union([LinkExpired, LinkNotFound, LinkNotReady]),
    payload: Schema.Struct({ token: Schema.String }),
    success: SharedDelivery,
  }),
) {}

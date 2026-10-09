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
  DeliveryNote,
  DeliveryNotFound,
  DeliveryRefused,
  DeliveryTitle,
  NewDelivery,
  TransferId,
} from "./delivery";
import { DeliveryEmail, DeliveryNotShareable, SendDeliveryEmailPayload } from "./email";
import { InterestJoined, JoinInterestPayload } from "./interest";
import {
  DownloadEvent,
  LinkExpired,
  LinkLocked,
  LinkNotFound,
  LinkNotReady,
  LinkPassword,
  SharedDelivery,
  Unlocked,
  WrongPassword,
} from "./link";
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
    error: Schema.Union([
      DeliveryConflict,
      DeliveryRefused,
      OverPlanLimit,
      RateLimited,
      RetentionNotInPlan,
    ]),
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
  // Owner only. Both fields are replaced; an empty note removes it.
  Rpc.make("UpdateDelivery", {
    error: DeliveryNotFound,
    payload: Schema.Struct({ deliveryId: DeliveryId, note: DeliveryNote, title: DeliveryTitle }),
    success: Delivery,
  }).middleware(Authenticated),
  // Owner only. A password replaces the old one; null removes it. Unlocks
  // issued under the old password stop working.
  Rpc.make("SetLinkPassword", {
    error: DeliveryNotFound,
    payload: Schema.Struct({ deliveryId: DeliveryId, password: Schema.NullOr(LinkPassword) }),
    success: Delivery,
  }).middleware(Authenticated),
  // Owner only; the delivery must be ready and unexpired. Answers at once with
  // one queued row per distinct address, in request order; the mail goes out in
  // the background and `DeliveryEmails` reports how each one ended.
  Rpc.make("SendDeliveryEmail", {
    error: Schema.Union([DeliveryNotFound, DeliveryNotShareable, RateLimited]),
    payload: SendDeliveryEmailPayload,
    success: Schema.Array(DeliveryEmail),
  }).middleware(Authenticated),
  // The sender's latest 50 emails for a delivery, newest first. Someone else's
  // delivery reads as none.
  Rpc.make("DeliveryEmails", {
    payload: Schema.Struct({ deliveryId: DeliveryId }),
    success: Schema.Array(DeliveryEmail),
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
  // `unlock` is what UnlockLink returned; a link with a password needs it to
  // show its files or sign their URLs.
  Rpc.make("OpenLink", {
    error: Schema.Union([LinkExpired, LinkLocked, LinkNotFound, LinkNotReady]),
    payload: Schema.Struct({ token: Schema.String, unlock: Schema.optional(Schema.String) }),
    success: SharedDelivery,
  }),
  // Public. Counted per client IP and per link, right and wrong passwords alike.
  Rpc.make("UnlockLink", {
    error: Schema.Union([LinkNotFound, RateLimited, WrongPassword]),
    payload: Schema.Struct({
      password: Schema.String.check(Schema.isMaxLength(128)),
      token: Schema.String,
    }),
    success: Unlocked,
  }),
  // Public and best effort: a bad or dead link, or a locked one without its
  // unlock, records nothing and says nothing.
  Rpc.make("ReportDownload", {
    payload: Schema.Struct({
      event: DownloadEvent,
      path: Schema.String,
      token: Schema.String,
      unlock: Schema.optional(Schema.String),
    }),
  }),
) {}

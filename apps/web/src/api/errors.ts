import {
  AuthenticationUnavailable,
  BillingUnavailable,
  DeliveryConflict,
  DeliveryNotFound,
  InvalidUpload,
  LinkExpired,
  LinkNotFound,
  LinkNotReady,
  NotUploaded,
  OverPlanLimit,
  PaidPlanId,
  plans,
  RetentionNotInPlan,
  StorageUnavailable,
  Unauthorized,
  UploadClosed,
} from "@tranzfer/contracts";
import type { Api } from "@tranzfer/contracts";
import * as Cause from "effect/Cause";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import type * as Rpc from "effect/rpc/Rpc";
import { RpcClientError } from "effect/rpc/RpcClientError";
import type * as RpcGroup from "effect/rpc/RpcGroup";

import { bytes } from "../dashboard/format";
import { supportEmail } from "../ui/Site";

/** Every error an Api call can fail with, middleware and transport included. */
export type ApiError = Rpc.Error<RpcGroup.Rpcs<typeof Api>> | RpcClientError;

const ApiErrors = Schema.Union([
  AuthenticationUnavailable,
  BillingUnavailable,
  DeliveryConflict,
  DeliveryNotFound,
  InvalidUpload,
  LinkExpired,
  LinkNotFound,
  LinkNotReady,
  NotUploaded,
  OverPlanLimit,
  RetentionNotInPlan,
  RpcClientError,
  StorageUnavailable,
  Unauthorized,
  UploadClosed,
]);

// Typed against ApiError, so a new contract error that is missing here fails
// the build at the Match below instead of silently reading as "unknown".
const isApiError: (value: unknown) => value is ApiError = Schema.is(ApiErrors);

// The cheapest paid plan above the current one that fits, if any does.
const planThatFits = (error: OverPlanLimit) =>
  PaidPlanId.literals.find(
    (plan) =>
      plans[plan].activeBytes > error.limitBytes &&
      plans[plan].activeBytes >= error.usedBytes + error.requestedBytes,
  );

const words = Match.type<ApiError>().pipe(
  Match.tagsExhaustive({
    AuthenticationUnavailable: () => "We couldn't check your sign-in. Try again in a moment.",
    // One tag covers Polar refusing the request and Polar not answering.
    // Neither charges anything.
    BillingUnavailable: () =>
      `Our payment provider turned this down or didn't answer, so nothing changed and nothing was charged. Try again later, or write to ${supportEmail}.`,
    DeliveryConflict: () => "That delivery already exists. Refresh to see it.",
    DeliveryNotFound: () => "We can't find that delivery anymore.",
    InvalidUpload: () => "This file doesn't match what the delivery expects. Send it again.",
    LinkExpired: () => "This link has expired.",
    LinkNotFound: () => "This link doesn't work. It may have been cancelled.",
    LinkNotReady: () => "Still uploading. The link starts working once every file is finished.",
    NotUploaded: () => "Still finishing up on our end. Retry in a moment.",
    OverPlanLimit: (error) => {
      const facts = `This delivery is ${bytes(error.requestedBytes)} and ${bytes(error.usedBytes)} of your ${bytes(error.limitBytes)} on ${plans[error.plan].name} is in use.`;
      const fit = planThatFits(error);
      return fit === undefined
        ? `${facts} Cancel a delivery to free space, or send this one in smaller parts.`
        : `${facts} ${plans[fit].name} holds ${bytes(plans[fit].activeBytes)}. Upgrade, or cancel a delivery to free space.`;
    },
    RetentionNotInPlan: (error) =>
      `${plans[error.plan].name} links last up to ${error.maxRetentionDays} days. Choose a shorter time, or upgrade.`,
    RpcClientError: () => "We couldn't reach Tranzfer. Check your connection and try again.",
    StorageUnavailable: () => "Storage didn't answer. Try again in a moment.",
    Unauthorized: () => "Your sign-in expired. Sign in again to continue.",
    UploadClosed: () => "This delivery was cancelled or has already finished.",
  }),
);

/**
 * The one place failures become words. Takes whatever a boundary caught (an
 * error, a Cause or an Uppy transport failure); anything that is not a known
 * Api error reads as a generic, retryable problem.
 */
export const appError = (cause: unknown) => {
  const error = Cause.isCause(cause) ? Cause.squash(cause) : cause;
  return isApiError(error)
    ? { message: words(error), tag: error._tag }
    : { message: "Something went wrong. Try again.", tag: "Unknown" as const };
};

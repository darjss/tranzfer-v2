import {
  AccessCodeRefused,
  AuthenticationUnavailable,
  BillingUnavailable,
  DeliveryConflict,
  DeliveryNotFound,
  DeliveryRefused,
  InvalidUpload,
  LinkExpired,
  LinkNotFound,
  LinkNotReady,
  NotUploaded,
  OverPlanLimit,
  PaidPlanId,
  plans,
  RateLimited,
  RetentionNotInPlan,
  StorageUnavailable,
  Unauthorized,
  UploadClosed,
} from "@tranzfer/contracts";
import type { Api, RateLimitName } from "@tranzfer/contracts";
import * as Cause from "effect/Cause";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";
import type * as Rpc from "effect/rpc/Rpc";
import { RpcClientError } from "effect/rpc/RpcClientError";
import type * as RpcGroup from "effect/rpc/RpcGroup";

import { bytes } from "../dashboard/format";
import { paidPlansOpen, supportEmail } from "../ui/support";

/** Every error an Api call can fail with, middleware and transport included. */
export type ApiError = Rpc.Error<RpcGroup.Rpcs<typeof Api>> | RpcClientError;

const ApiErrors = Schema.Union([
  AccessCodeRefused,
  AuthenticationUnavailable,
  BillingUnavailable,
  DeliveryConflict,
  DeliveryNotFound,
  DeliveryRefused,
  InvalidUpload,
  LinkExpired,
  LinkNotFound,
  LinkNotReady,
  NotUploaded,
  OverPlanLimit,
  RateLimited,
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

const tooMany = {
  authRequests: "Too many sign-in attempts from your network.",
  codeRedemptions: "Too many code attempts.",
  deliveriesPerDay: "Too many new deliveries in a day.",
  deliveriesPerHour: "Too many new deliveries in an hour.",
  interestSignups: "Too many sign-ups from your network.",
  newAccounts: "Too many new accounts from your network today.",
  uploadSigning: "Too many upload requests at once.",
} satisfies Record<RateLimitName, string>;

const count = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"}`;

// Rounded up, so the wait it names is never too short.
const wait = (seconds: number) => {
  if (seconds < 60) {
    return count(seconds, "second");
  }
  if (seconds < 60 * 60) {
    return count(Math.ceil(seconds / 60), "minute");
  }
  return count(Math.ceil(seconds / (60 * 60)), "hour");
};

const number = (value: number) => value.toLocaleString("en-US");

// A long name stays recognizable without filling the card.
const quoted = (text: string) => {
  const letters = text.match(/./gsu) ?? [];
  return `"${letters.length > 80 ? `${letters.slice(0, 80).join("")}…` : text}"`;
};

const refusal = Match.type<DeliveryRefused["reason"]>().pipe(
  Match.tagsExhaustive({
    DuplicatePath: ({ path }) =>
      `Two files are called ${quoted(path)} once capitals are ignored, so they would collide on the recipient's computer. Rename one.`,
    NameTooLong: ({ bytes: size, max, name }) => {
      const characters = (name.match(/./gsu) ?? []).length;
      return characters === size
        ? `${quoted(name)} is ${number(characters)} characters long. Names can be up to ${number(max)}. Shorten it and try again.`
        : `${quoted(name)} is ${number(characters)} characters and ${number(size)} bytes long. Names can be up to ${number(max)} bytes, which is fewer characters outside plain English letters. Shorten it and try again.`;
    },
    PathTooLong: ({ bytes: size, max, path }) =>
      `${quoted(path)} is ${number(size)} bytes long with its folders. A path can be up to ${number(max)}. Shorten the folder names or move the files up a level.`,
    PathUnsafe: ({ path }) =>
      `${quoted(path)} isn't a path we can carry safely. Names can't contain backslashes or control characters, or be empty, "." or "..".`,
    TooManyFiles: ({ count: total, max }) =>
      `That's ${number(total)} files. A delivery holds up to ${number(max)}. Send them in two deliveries or zip a folder.`,
  }),
);

const words = Match.type<ApiError>().pipe(
  Match.tagsExhaustive({
    AccessCodeRefused: (error) =>
      Match.value(error.reason).pipe(
        Match.when("unknown", () => "We don't know that code. Check the spelling and try again."),
        Match.when("expired", () => "That code has expired."),
        Match.when("usedUp", () => "That code has run out of uses."),
        Match.when("alreadyRedeemed", () => "You've already used that code."),
        Match.exhaustive,
      ),
    AuthenticationUnavailable: () => "We couldn't check your sign-in. Try again in a moment.",
    // `provider` covers Polar refusing the request and Polar not answering.
    // Neither charges anything.
    BillingUnavailable: (error) =>
      error.reason === "notOpen"
        ? "Paid plans aren't open yet, so nothing changed and nothing was charged."
        : `Our payment provider turned this down or didn't answer, so nothing changed and nothing was charged. Try again later, or write to ${supportEmail}.`,
    DeliveryConflict: () => "That delivery already exists. Refresh to see it.",
    DeliveryNotFound: () => "We can't find that delivery anymore.",
    DeliveryRefused: (error) => refusal(error.reason),
    InvalidUpload: () => "This file doesn't match what the delivery expects. Send it again.",
    LinkExpired: () => "This link has expired.",
    LinkNotFound: () => "This link doesn't work. It may have been cancelled.",
    LinkNotReady: () => "Still uploading. The link starts working once every file is finished.",
    NotUploaded: () => "Still finishing up on our end. Retry in a moment.",
    OverPlanLimit: (error) => {
      const facts = `This delivery is ${bytes(error.requestedBytes)} and ${bytes(error.usedBytes)} of your ${bytes(error.limitBytes)} on ${plans[error.plan].name} is in use.`;
      // Until paid plans open there is nothing bigger to move to.
      const fit = paidPlansOpen ? planThatFits(error) : undefined;
      return fit === undefined
        ? `${facts} Cancel a delivery to free space, or send this one in smaller parts.`
        : `${facts} ${plans[fit].name} holds ${bytes(plans[fit].activeBytes)}. Upgrade, or cancel a delivery to free space.`;
    },
    RateLimited: (error) =>
      `${tooMany[error.limit]} Try again in ${wait(error.retryAfterSeconds)}.`,
    RetentionNotInPlan: (error) =>
      `${plans[error.plan].name} links last up to ${error.maxRetentionDays} days. Choose a shorter time${paidPlansOpen ? ", or upgrade" : ""}.`,
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

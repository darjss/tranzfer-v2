import type { PaidPlanId, PlanId } from "@tranzfer/contracts";
import * as Exit from "effect/Exit";
import type * as ManagedRuntime from "effect/ManagedRuntime";

import { ApiClient } from "../api/client";
import { appError } from "../api/errors";
import type { AppServices } from "../api/solid-effect";

/** The next plan up, which the Upgrade button offers. Studio is the top. */
export const upgradeFrom = {
  free: "starter",
  pro: "studio",
  starter: "pro",
  studio: undefined,
} as const satisfies Record<PlanId, PaidPlanId | undefined>;

/**
 * Sends the browser to Polar's checkout for a plan, or to the billing portal
 * when the account already subscribes (the server decides). Resolves to the
 * problem to show; on success the page is already leaving.
 */
export const goToCheckout = async (
  runtime: ManagedRuntime.ManagedRuntime<AppServices, never>,
  plan: PaidPlanId,
) => {
  const exit = await runtime.runPromiseExit(ApiClient.use((api) => api.StartCheckout({ plan })));
  if (Exit.isSuccess(exit)) {
    window.location.assign(exit.value.url);
  }
  return Exit.isFailure(exit) ? appError(exit.cause) : undefined;
};

export const goToPortal = async (runtime: ManagedRuntime.ManagedRuntime<AppServices, never>) => {
  const exit = await runtime.runPromiseExit(ApiClient.use((api) => api.OpenBillingPortal()));
  if (Exit.isSuccess(exit)) {
    window.location.assign(exit.value.url);
  }
  return Exit.isFailure(exit) ? appError(exit.cause) : undefined;
};

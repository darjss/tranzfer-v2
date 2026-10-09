export const supportEmail = "support@tranzfer.app";

/**
 * Whether this deploy sells paid plans. Closed, pricing shows prices without
 * a checkout and the dashboard offers no upgrade (docs/PRODUCT.md). Unset
 * reads as closed, so a build that missed the switch never sends anyone to a
 * checkout the API would refuse.
 */
export const paidPlansOpen = import.meta.env.VITE_PAID_PLANS_OPEN === "true";

import * as Schema from "effect/Schema";

import { DeliveryId } from "./delivery";
import { EmailAddress } from "./interest";

/** The most addresses one send takes. */
export const maxRecipients = 10;

/**
 * `queued`: not handed to the mail server yet. `sent`: the mail server took
 * it. That is as far as anyone can see; it says nothing about the inbox.
 * `failed`: it didn't go, and `errorCode` says why.
 */
export const EmailStatus = Schema.Literals(["queued", "sent", "failed"]);
export type EmailStatus = typeof EmailStatus.Type;

/**
 * One email to one recipient. The address is not stored, so the sender's page
 * pairs a row with the address it typed by its place in the request.
 * `errorCode` is Cloudflare's, like `E_RECIPIENT_SUPPRESSED` for an address
 * that bounced before, or `held` when this stage emails only an allowlist,
 * or `lost` when a send never finished.
 */
export const DeliveryEmail = Schema.Struct({
  errorCode: Schema.NullOr(Schema.String),
  id: Schema.Int,
  status: EmailStatus,
});
export interface DeliveryEmail extends Schema.Schema.Type<typeof DeliveryEmail> {}

export const SendDeliveryEmailPayload = Schema.Struct({
  deliveryId: DeliveryId,
  recipients: Schema.Array(EmailAddress).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(maxRecipients),
  ),
});

/** Only a delivery that is ready and unexpired has a link worth emailing. */
export class DeliveryNotShareable extends Schema.TaggedError<DeliveryNotShareable>()(
  "DeliveryNotShareable",
  {},
) {}

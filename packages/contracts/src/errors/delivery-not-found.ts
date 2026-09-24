import * as Schema from "effect/Schema";

export class DeliveryNotFound extends Schema.TaggedError<DeliveryNotFound>()("DeliveryNotFound", {
  message: Schema.String,
}) {}

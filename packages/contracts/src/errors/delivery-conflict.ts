import * as Schema from "effect/Schema";

export class DeliveryConflict extends Schema.TaggedError<DeliveryConflict>()("DeliveryConflict", {
  message: Schema.String,
}) {}

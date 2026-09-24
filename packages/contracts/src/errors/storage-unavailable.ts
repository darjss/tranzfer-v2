import * as Schema from "effect/Schema";

export class StorageUnavailable extends Schema.TaggedError<StorageUnavailable>()(
  "StorageUnavailable",
  {
    message: Schema.String,
  },
) {}

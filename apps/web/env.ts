import { createEnv } from "@t3-oss/env-core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

// Solid's plugin loads this file in Node and wants Standard Schema maps.
// Effect schemas are functions, so the plugin's `typeof === "object"` check
// rejects them. Export the `~standard` bag on a plain object. T3 Env uses
// the same maps plus runtimeEnv.

const VITE_APP_NAME = {
  "~standard": Schema.toStandardSchemaV1(
    Schema.NonEmptyString.pipe(
      Schema.optional,
      Schema.withDecodingDefault(Effect.succeed("Tranzfer")),
    ),
  )["~standard"],
};

const client = {
  VITE_APP_NAME,
};

const server = {};

createEnv({
  client,
  clientPrefix: "VITE_",
  runtimeEnv: process.env,
  server,
});

export default {
  client,
  server,
};

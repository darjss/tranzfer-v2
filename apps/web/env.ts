import * as v from "valibot";

// Typed env schema probed by the Solid plugin. `client` vars carry the
// public VITE_ prefix and are baked into the bundle via `virtual:env/client`.
// Server vars (read from process.env at boot via `virtual:env/server`) go
// under `server` when the app has one.
export default {
  server: {},
  client: {
    VITE_APP_NAME: v.optional(v.pipe(v.string(), v.minLength(1)), "Tranzfer"),
  },
};

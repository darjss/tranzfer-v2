import * as Effect from "effect/Effect";
import { Worker } from "effect-cf";

import { AppLayer, RpcHandler } from "./runtime";
import { Auth } from "./services/auth";

const fetch = Effect.gen(function* fetchWorker() {
  const request = yield* Worker.NativeRequest;
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/api/auth/")) {
    return yield* (yield* Auth).handler(request);
  }
  if (pathname === "/rpc") {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    return yield* (yield* RpcHandler).handle;
  }
  if (pathname === "/health") {
    return Response.json({ ok: true });
  }
  return new Response(null, { status: 404 });
});

export default Worker.make(AppLayer, { fetch });

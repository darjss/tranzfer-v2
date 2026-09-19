import { Api } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcServer from "effect/unstable/rpc/RpcServer";
import { Worker } from "effect-cf";

import { AuthHandlers } from "./handlers/auth";
import { AppLayer } from "./runtime";
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
    // The HTTP request owns auth response cookies and RPC fibers.
    const handlers = yield* Layer.build(Layer.fresh(AuthHandlers));
    const handle = yield* RpcServer.toHttpEffect(Api).pipe(Effect.provideContext(handlers));
    return yield* handle;
  }
  if (pathname === "/health") {
    return Response.json({ ok: true });
  }
  return new Response(null, { status: 404 });
});

export default Worker.make(AppLayer, { fetch });

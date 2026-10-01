import { Api } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as RpcClient from "effect/rpc/RpcClient";

// An RPC client over HTTP against a deployed stage. The protocol POSTs to an
// empty path, so the request gets its URL here. Pass a session cookie for the
// authed endpoints; omit it to prove anonymous routes need no session.
// Requires HttpClient, RpcSerialization and Scope in context.
export const apiClient = (baseUrl: string, cookie?: string) =>
  Effect.gen(function* client() {
    const http = yield* HttpClient.HttpClient;
    const transport = HttpClient.mapRequest(http, (request) => {
      const authed =
        cookie === undefined ? request : HttpClientRequest.setHeader("cookie", cookie)(request);
      return HttpClientRequest.setUrl(`${baseUrl}/rpc`)(authed);
    });
    const protocol = yield* RpcClient.makeProtocolHttp(transport);
    return yield* RpcClient.make(Api).pipe(Effect.provideService(RpcClient.Protocol, protocol));
  });

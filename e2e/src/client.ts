import { Api } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as RpcClient from "effect/unstable/rpc/RpcClient";

// An RPC client over HTTP against a deployed stage. Pass a session cookie for
// the authed endpoints; omit it to prove anonymous routes need no session.
// Requires HttpClient, RpcSerialization and Scope in context.
export const apiClient = (baseUrl: string, cookie?: string) =>
  Effect.gen(function* client() {
    const http = yield* HttpClient.HttpClient;
    const transport =
      cookie === undefined
        ? http
        : HttpClient.mapRequest(HttpClientRequest.setHeader("cookie", cookie))(http);
    const protocol = yield* RpcClient.makeProtocolHttp(transport);
    return yield* RpcClient.make(Api).pipe(Effect.provideService(RpcClient.Protocol, protocol));
  });

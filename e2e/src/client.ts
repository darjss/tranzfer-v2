import { Api } from "@tranzfer/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Cookies from "effect/http/Cookies";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as RpcClient from "effect/rpc/RpcClient";

// An RPC client over HTTP against a deployed stage. The protocol POSTs to an
// empty path, so the request gets its URL here. Pass the session cookies for
// the authed endpoints; omit them to prove anonymous routes need no session.
// Like a browser, it keeps the cookies each response sets, the D1 bookmark
// among them, so its next call reads its own writes.
// Requires HttpClient, RpcSerialization and Scope in context.
export const apiClient = (baseUrl: string, cookies = Cookies.empty) =>
  Effect.gen(function* client() {
    const jar = yield* Ref.make(cookies);
    const transport = (yield* HttpClient.HttpClient).pipe(
      HttpClient.withCookiesRef(jar),
      HttpClient.mapRequest(HttpClientRequest.setUrl(`${baseUrl}/rpc`)),
    );
    const protocol = yield* RpcClient.makeProtocolHttp(transport);
    return yield* RpcClient.make(Api).pipe(Effect.provideService(RpcClient.Protocol, protocol));
  });

import type { Api } from "@tranzfer/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

import { apiClient } from "./client";

type Client = RpcClient.FromGroup<typeof Api, RpcClientError>;

const stagingLogin = async (baseUrl: string, key: string) => {
  const response = await fetch(`${baseUrl}/api/auth/staging-login`, {
    body: JSON.stringify({ key }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const cookies = response.headers.getSetCookie();
  if (!response.ok || cookies.length === 0) {
    throw new Error(`staging-login failed: ${response.status} ${await response.text()}`);
  }
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
};

export class Target extends Context.Service<
  Target,
  {
    readonly anon: Client;
    readonly api: Client;
    readonly baseUrl: string;
  }
>()("tranzfer/e2e/Target") {
  static readonly layer = Layer.effect(
    Target,
    Effect.gen(function* target() {
      const baseUrl = process.env.E2E_BASE_URL ?? "https://staging.tranzfer.app";
      const key = process.env.TEST_LOGIN_KEY;
      if (key === undefined) {
        return yield* Effect.die(new Error("TEST_LOGIN_KEY is required for the staging target"));
      }
      const cookie = yield* Effect.promise(async () => await stagingLogin(baseUrl, key));
      const api = yield* apiClient(baseUrl, cookie);
      const anon = yield* apiClient(baseUrl);
      return Target.of({ anon, api, baseUrl });
    }),
  ).pipe(Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]));
}

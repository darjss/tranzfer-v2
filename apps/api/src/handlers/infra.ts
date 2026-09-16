import { Api, ProbeFailed } from "@tranzfer/contracts";
import { D1Client } from "@tranzfer/db";
import { sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Environment } from "effect-cf";

const probeR2 = (env: Cloudflare.Env) => {
  const key = `infra-probe/${crypto.randomUUID()}`;
  return Effect.tryPromise({
    catch: (cause) => new ProbeFailed({ message: String(cause), resource: "r2" }),
    try: async () => {
      await env.BUCKET.put(key, "ok");
      const object = await env.BUCKET.get(key);
      const text = object === null ? null : await object.text();
      if (text !== "ok") {
        throw new Error("r2 probe round-trip mismatch");
      }
    },
  }).pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        await env.BUCKET.delete(key);
      }),
    ),
  );
};

export const InfraHandlers = Api.toLayer(
  Effect.gen(function* InfraHandlers() {
    const db = yield* D1Client;
    const env = yield* Environment.WorkerEnvironment;

    const probeD1 = db.get<{ ok: number }>(sql`SELECT 1 AS ok`).pipe(
      Effect.mapError((cause) => new ProbeFailed({ message: String(cause), resource: "d1" })),
      Effect.filterOrFail(
        (row) => row?.ok === 1,
        () => new ProbeFailed({ message: "d1 probe returned no row", resource: "d1" }),
      ),
      Effect.asVoid,
    );

    return {
      Health: () => Effect.succeed({ ok: true as const }),
      Infra: () =>
        probeD1.pipe(
          Effect.andThen(probeR2(env)),
          Effect.map(() => ({ d1: true, r2: true })),
        ),
    };
  }),
);

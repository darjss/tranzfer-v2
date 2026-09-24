import { Api, ProbeFailed } from "@tranzfer/contracts";
import { Drizzle } from "@tranzfer/db";
import { sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Environment } from "effect-cf";

const probeR2 = (env: Cloudflare.Env) =>
  Effect.tryPromise({
    catch: () => new ProbeFailed({ message: "R2 probe failed", resource: "r2" }),
    // A missing object still proves the binding can read the bucket.
    try: async () => {
      await env.BUCKET.head("infra-probe/health");
    },
  });

export const InfraHandlers = Layer.mergeAll(
  Api.toLayerHandler(
    "Health",
    Effect.fn("InfraHandlers.Health")(() => Effect.succeed({ ok: true as const })),
  ),
  Api.toLayerHandler(
    "Infra",
    Effect.gen(function* InfraHandler() {
      const db = yield* Drizzle;
      const env = yield* Environment.WorkerEnvironment;

      const probeD1 = db
        .run("infra.probeD1", (d) => d.get<{ ok: number }>(sql`SELECT 1 AS ok`))
        .pipe(
          Effect.mapError(
            () =>
              new ProbeFailed({
                message: "D1 probe failed",
                resource: "d1",
              }),
          ),
          Effect.filterOrFail(
            (row) => row?.ok === 1,
            () => new ProbeFailed({ message: "d1 probe returned no row", resource: "d1" }),
          ),
          Effect.asVoid,
        );

      return Effect.fn("InfraHandlers.Infra")(() =>
        probeD1.pipe(
          Effect.andThen(probeR2(env)),
          Effect.map(() => ({ d1: true, r2: true })),
        ),
      );
    }),
  ),
);

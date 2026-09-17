import { Api, ProbeFailed } from "@tranzfer/contracts";
import { D1Client } from "@tranzfer/db";
import { sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import { Environment } from "effect-cf";

const probeR2 = (env: Cloudflare.Env) =>
  Effect.suspend(() => {
    const key = `infra-probe/${crypto.randomUUID()}`;
    return Effect.tryPromise({
      catch: (cause) =>
        new ProbeFailed({
          message: Predicate.isError(cause) ? cause.message : String(cause),
          resource: "r2",
        }),
      try: async () => {
        await env.BUCKET.put(key, "ok");
        const object = await env.BUCKET.get(key);
        const text = object === null ? null : await object.text();
        if (text !== "ok") {
          throw new Error("r2 probe round-trip mismatch");
        }
      },
    }).pipe(
      // best-effort cleanup; a failed delete logs and doesn't mask the probe.
      // ignoreCause, not ignore: promise rejection is a defect, which ignore
      // (error-channel only) would let propagate and fail the probe.
      Effect.ensuring(
        Effect.promise(async () => {
          await env.BUCKET.delete(key);
        }).pipe(Effect.ignoreCause({ log: true })),
      ),
    );
  });

export const InfraHandlers = Api.toLayer(
  Effect.gen(function* InfraHandlers() {
    const db = yield* D1Client;
    const env = yield* Environment.WorkerEnvironment;

    const probeD1 = db.get<{ ok: number }>(sql`SELECT 1 AS ok`).pipe(
      Effect.mapError(
        (cause) =>
          new ProbeFailed({
            message: Predicate.isError(cause) ? cause.message : String(cause),
            resource: "d1",
          }),
      ),
      Effect.filterOrFail(
        (row) => row?.ok === 1,
        () => new ProbeFailed({ message: "d1 probe returned no row", resource: "d1" }),
      ),
      Effect.asVoid,
    );

    return {
      Health: Effect.fn("InfraHandlers.Health")(() => Effect.succeed({ ok: true as const })),
      Infra: Effect.fn("InfraHandlers.Infra")(() =>
        probeD1.pipe(
          Effect.andThen(probeR2(env)),
          Effect.map(() => ({ d1: true, r2: true })),
        ),
      ),
    };
  }),
);

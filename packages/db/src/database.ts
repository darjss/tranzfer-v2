import * as D1Client from "@effect/sql-d1/D1Client";
import type { Query } from "drizzle-orm";
import * as EffectD1 from "drizzle-orm/effect-d1";
import { defineRelations } from "drizzle-orm/relations";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SqlError } from "effect/sql/SqlError";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";

import * as schema from "./schema";

const relations = defineRelations(schema, (r) => ({
  delivery: {
    link: r.one.link({ from: r.delivery.id, to: r.link.deliveryId }),
    sender: r.one.user({ from: r.delivery.senderId, optional: false, to: r.user.id }),
    transfers: r.many.transfer(),
  },
  link: {
    delivery: r.one.delivery({ from: r.link.deliveryId, optional: false, to: r.delivery.id }),
  },
  transfer: {
    delivery: r.one.delivery({ from: r.transfer.deliveryId, optional: false, to: r.delivery.id }),
  },
}));

const makeDb = EffectD1.makeWithDefaults({ relations });

/** Drizzle over D1 as native Effects. D1 has no interactive transactions; `batch` is the only atomic unit. */
export class Database extends Context.Service<
  Database,
  {
    readonly db: Effect.Success<typeof makeDb>;
    readonly batch: (
      queries: readonly { readonly toSQL: () => Query }[],
    ) => Effect.Effect<void, SqlError>;
  }
>()("tranzfer/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* makeDatabase() {
      const client = yield* D1Client.D1Client;
      return Database.of({
        batch: (queries) =>
          client
            .batch(
              queries.map((query) => {
                const { params, sql } = query.toSQL();
                return client.unsafe(sql, params);
              }),
            )
            .pipe(Effect.asVoid),
        db: yield* makeDb,
      });
    }),
  );

  static readonly fromD1 = (db: D1Database) =>
    Database.layer.pipe(Layer.provide(D1Client.layer({ db })), Layer.orDie);
}

type DatabaseError = EffectDrizzleQueryError | SqlError;

const isDatabaseError = <E>(error: E): error is Extract<E, DatabaseError> =>
  error instanceof EffectDrizzleQueryError || error instanceof SqlError;

/** Database failures are infrastructure faults, never outcomes a caller can act on. */
export const dieOnDatabaseError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.catchIf(effect, isDatabaseError, Effect.die, Effect.fail);

import * as D1Client from "@effect/sql-d1/D1Client";
import type { Query } from "drizzle-orm";
import * as EffectD1 from "drizzle-orm/effect-d1";
import { defineRelations } from "drizzle-orm/relations";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
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
  fileRequest: {
    owner: r.one.user({ from: r.fileRequest.ownerId, optional: false, to: r.user.id }),
  },
  link: {
    delivery: r.one.delivery({ from: r.link.deliveryId, optional: false, to: r.delivery.id }),
  },
  transfer: {
    delivery: r.one.delivery({ from: r.transfer.deliveryId, optional: false, to: r.delivery.id }),
  },
}));

const makeDb = EffectD1.makeWithDefaults({ relations });

type D1Handle = D1Database | D1DatabaseSession;

// Drizzle and the client under it, over one D1 handle.
const connect = (handle: D1Handle) =>
  Effect.gen(function* connect() {
    // SAFETY: D1Client types its handle as D1Database but calls only
    // `prepare` and `batch` on it, which a D1DatabaseSession implements the
    // same way.
    const context = yield* Layer.build(D1Client.layer({ db: handle as D1Database }));
    return {
      client: Context.get(context, D1Client.D1Client),
      db: yield* makeDb.pipe(Effect.provideContext(context)),
    };
  });

/** Drizzle over D1 as native Effects. D1 has no interactive transactions; `batch` is the only atomic unit. */
export class Database extends Context.Service<
  Database,
  {
    readonly db: Effect.Success<typeof makeDb>;
    readonly batch: (
      queries: readonly { readonly toSQL: () => Query }[],
    ) => Effect.Effect<void, SqlError>;
    /**
     * The same tables on a session whose first query goes to the primary.
     * Read here when a replica's "not there" may hide another client's write.
     */
    readonly primary: Effect.Success<typeof makeDb>;
    /** The handle under `db`, so Better Auth's queries join the same session. */
    readonly d1: D1Handle;
  }
>()("tranzfer/Database") {
  /** `primary` defaults to `d1`, for a handle that already starts on the primary. */
  static readonly layer = (d1: D1Handle, primary: D1Handle = d1) =>
    Layer.effect(
      Database,
      Effect.gen(function* makeDatabase() {
        const { client, db } = yield* connect(d1);
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
          d1,
          db,
          primary: primary === d1 ? db : (yield* connect(primary)).db,
        });
      }),
    ).pipe(Layer.orDie);
}

type DatabaseError = EffectDrizzleQueryError | SqlError;

const isDatabaseError = <E>(error: E): error is Extract<E, DatabaseError> =>
  error instanceof EffectDrizzleQueryError || error instanceof SqlError;

/**
 * The defect a failed query leaves. RpcServer sends a defect's message to the
 * browser and the tracer puts it on the span, and drizzle's message holds the
 * SQL and every bound value, so the original stays in the log as a tag and
 * placeholder SQL only.
 */
export class DatabaseFault extends Data.TaggedError("DatabaseFault") {}

export const databaseFault = (error: DatabaseError) =>
  Effect.logError("database error", {
    error: error._tag,
    query: error instanceof EffectDrizzleQueryError ? error.query : undefined,
  }).pipe(Effect.andThen(Effect.die(new DatabaseFault())));

/** Database failures are infrastructure faults, never outcomes a caller can act on. */
export const dieOnDatabaseError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.catchIf(effect, isDatabaseError, (error) => databaseFault(error), Effect.fail);

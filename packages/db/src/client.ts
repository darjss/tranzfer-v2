import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { defineRelations } from "drizzle-orm/relations";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DrizzleError } from "./errors/drizzle";
import * as schema from "./schema";

// The raw D1 handle as a lazy accessor, not a value: the API Worker's init
// effect also evaluates at deploy time, when the env holds no D1 binding, so
// nothing may touch the handle until an invocation resolves it. The API
// provides this as the QueryDatabase client's `raw` effect.
export class Database extends Context.Service<Database, Effect.Effect<D1Database>>()(
  "tranzfer/Database",
) {}

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

export class Drizzle extends Context.Service<
  Drizzle,
  {
    readonly run: <A>(
      op: string,
      fn: (db: DrizzleD1Database<typeof relations>) => Promise<A>,
    ) => Effect.Effect<A, DrizzleError>;
  }
>()("tranzfer/Drizzle") {
  static readonly layer = Layer.effect(
    Drizzle,
    Effect.gen(function* makeDrizzle() {
      const raw = yield* Database;
      return Drizzle.of({
        // The binding only exists inside an invocation, so the handle and the
        // drizzle instance are both resolved per call.
        run: (op, fn) =>
          raw.pipe(
            Effect.flatMap((handle) =>
              Effect.tryPromise({
                catch: (cause) => new DrizzleError({ cause, op }),
                try: async () => await fn(drizzle(handle, { relations })),
              }),
            ),
          ),
      });
    }),
  );
}

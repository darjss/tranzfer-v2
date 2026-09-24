import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { defineRelations } from "drizzle-orm/relations";
import { D1 } from "effect-cf";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DrizzleError } from "./errors/drizzle";
import * as schema from "./schema";

// Validated lookup of the DB binding; env.DB cannot be typed here because
// Cloudflare.Env is only declared in apps/api.
const d1 = D1.make("tranzfer/D1", { binding: "DB" });

// The single raw-handle seam (phoenix ADR 0040 shape): Drizzle and the
// better-auth adapter both derive from this tag, so one isolate has one D1
// handle and the layer graph enforces it.
export class Database extends Context.Service<Database, D1Database>()("tranzfer/Database") {
  static readonly layer = Layer.effect(Database, d1).pipe(Layer.provide(d1.layer));
}

const relations = defineRelations(schema);

export class Drizzle extends Context.Service<
  Drizzle,
  {
    // The live instance so the better-auth drizzleAdapter can share this
    // handle instead of constructing a second one.
    readonly db: DrizzleD1Database<typeof relations>;
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
      const db = drizzle(raw, { relations });
      return Drizzle.of({
        db,
        run: (op, fn) =>
          Effect.tryPromise({
            catch: (cause) => new DrizzleError({ cause, op }),
            try: async () => await fn(db),
          }),
      });
    }),
  ).pipe(Layer.provide(Database.layer));
}

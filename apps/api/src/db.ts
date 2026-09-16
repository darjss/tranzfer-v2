import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { D1 } from "effect-cf";
import * as SQLiteD1Drizzle from "drizzle-orm/effect-d1";

const d1 = D1.make("tranzfer-api/D1", { binding: "DB" });

export class Db extends Context.Service<Db, SQLiteD1Drizzle.EffectSQLiteD1Database>()(
  "tranzfer-api/Db",
) {
  static readonly layer = Layer.effect(Db, SQLiteD1Drizzle.makeWithDefaults({})).pipe(
    Layer.provide(d1.sqlLayer()),
  );
}

import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { D1 } from "effect-cf";
import * as SQLiteD1Drizzle from "drizzle-orm/effect-d1";

const d1 = D1.make("tranzfer/D1", { binding: "DB" });

export class D1Client extends Context.Service<D1Client, SQLiteD1Drizzle.EffectSQLiteD1Database>()(
  "tranzfer/D1Client",
) {
  static readonly layer = Layer.effect(D1Client, SQLiteD1Drizzle.makeWithDefaults({})).pipe(
    Layer.provide(d1.sqlLayer()),
  );
}

import { drizzle } from "drizzle-orm/d1";
import { migrate } from "drizzle-orm/d1/migrator";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { getPlatformProxy } from "wrangler";

import { Database } from "./database";

/** A fresh, migrated local D1 per layer build, with the same driver the Worker uses. */
export const testDatabase = Layer.unwrap(
  Effect.gen(function* makeTestDatabase() {
    const proxy = yield* Effect.acquireRelease(
      Effect.promise(
        async () =>
          await getPlatformProxy<{ DB: D1Database }>({
            configPath: new URL("../test/wrangler.jsonc", import.meta.url).pathname,
            persist: false,
          }),
      ),
      (platform) =>
        Effect.promise(async () => {
          await platform.dispose();
        }),
    );
    yield* Effect.promise(
      async () =>
        await migrate(drizzle(proxy.env.DB), {
          migrationsFolder: new URL("../migrations", import.meta.url).pathname,
        }),
    );
    return Database.fromD1(proxy.env.DB);
  }),
);

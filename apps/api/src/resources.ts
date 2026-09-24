import * as Cloudflare from "alchemy/Cloudflare";

export const App = Cloudflare.D1.Database("App", {
  // Resolved against process.cwd() by the provider, which is infra/ for
  // dev/plan/deploy.
  migrations: { dir: "../packages/db/migrations", table: "drizzle_migrations" },
});

export const Files = Cloudflare.R2.Bucket("Files");

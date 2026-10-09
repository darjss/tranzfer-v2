// Creates and lists beta access codes in a stage's remote D1 through wrangler.
// docs/PRODUCT.md "Access codes" has the commands. Cloudflare credentials come
// from the repo's .env, the same file `alchemy` deploys with.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import * as Schema from "effect/Schema";

const envFile = new URL("../../../.env", import.meta.url).pathname;
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  // `vp run code:create -- --code …` passes the `--` through; ignore it.
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    code: { type: "string" },
    days: { type: "string" },
    expires: { type: "string" },
    plan: { type: "string" },
    stage: { default: "production", type: "string" },
    uses: { type: "string" },
  },
});

const fail = (message: string) => {
  console.error(message);
  process.exit(1);
};

const whole = (name: string, value: string | undefined) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    fail(`--${name} needs a whole number above zero.`);
  }
  return number;
};

// Alchemy names the database `<stack>-<id>-<stage>-<suffix>`, with anything
// outside [A-Za-z0-9-] turned into a dash (alchemy/src/PhysicalName.ts).
const database = () => {
  const prefix = `tranzfer-App-${values.stage.replaceAll(/[^A-Za-z0-9-]/gu, "-")}-`;
  const names = Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Array(Schema.Struct({ name: Schema.String }))),
  )(execFileSync(wrangler, ["d1", "list", "--json"], { encoding: "utf-8" }))
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(prefix));
  if (names.length !== 1) {
    fail(`Expected one D1 database named ${prefix}…, found ${names.length}.`);
  }
  return names[0] ?? "";
};

const execute = (sql: string) => {
  const name = database();
  console.log(`${values.stage}: ${name}`);
  execFileSync(wrangler, ["d1", "execute", name, "--remote", "--yes", "--command", sql], {
    stdio: "inherit",
  });
};

const create = () => {
  const code = (values.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/u.test(code)) {
    fail("--code needs 3 to 40 letters, digits or dashes, like BETA-PRO.");
  }
  const plan = values.plan ?? "";
  if (!["starter", "pro", "studio"].includes(plan)) {
    fail("--plan is starter, pro or studio.");
  }
  const days = whole("days", values.days);
  const uses = whole("uses", values.uses);
  // The last day it can be redeemed, in UTC; it stops at the next midnight.
  const expiresAt =
    values.expires === undefined ? Number.NaN : Date.parse(`${values.expires}T00:00:00Z`);
  if (values.expires !== undefined && Number.isNaN(expiresAt)) {
    fail("--expires is a date like 2026-12-31.");
  }
  const expires = Number.isNaN(expiresAt) ? "NULL" : String(expiresAt + 24 * 60 * 60 * 1000);
  // Every value is checked above, so inlining them is safe.
  execute(
    `INSERT INTO access_code (code, plan, days, max_uses, expires_at) VALUES ('${code}', '${plan}', ${days}, ${uses}, ${expires})`,
  );
  const host = values.stage === "production" ? "tranzfer.app" : `${values.stage}.tranzfer.app`;
  console.log(`Invite link: https://${host}/sign-in?code=${code}`);
};

const list = () => {
  execute(
    "SELECT code, plan, days, uses, max_uses, CASE WHEN expires_at IS NULL THEN '' ELSE date(expires_at / 1000, 'unixepoch', '-1 day') END AS last_day, date(created_at / 1000, 'unixepoch') AS created FROM access_code ORDER BY created_at DESC",
  );
};

const [command] = positionals;
if (command === "create") {
  create();
} else if (command === "list") {
  list();
} else {
  fail(
    "Usage: codes.ts create --code BETA-PRO --plan pro --days 90 --uses 30 [--expires 2026-12-31] [--stage production|staging] | codes.ts list [--stage …]",
  );
}

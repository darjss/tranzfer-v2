import type {
  DeliveryId,
  PaidPlanId,
  PlanId,
  RetentionDays,
  SubscriptionStatus,
  TransferId,
} from "@tranzfer/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// One row per account creation a client IP was allowed, for the
// new-accounts cap. The sign-up hook adds a row only while the IP is under the
// cap, in the same statement that counts, so concurrent sign-ups can't pass it.
export const signup = sqliteTable(
  "signup",
  {
    ip: text("ip").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("signup_ip_createdAt_idx").on(table.ip, table.createdAt)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const delivery = sqliteTable(
  "delivery",
  {
    id: text("id").$type<DeliveryId>().primaryKey(),
    // No cascade: account deletion needs an R2 object cleanup path first.
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    status: text("status", { enum: ["open", "ready", "cancelled"] })
      .default("open")
      .notNull(),
    retentionDays: integer("retention_days").$type<RetentionDays>().notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    // Set once the sweeper has removed a cancelled or expired delivery's objects.
    purgedAt: integer("purged_at", { mode: "timestamp_ms" }),
    // Set when the sender clears an ended delivery off the dashboard. The row
    // stays so the sweeper still purges it and its link still reads as ended.
    clearedAt: integer("cleared_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("delivery_senderId_createdAt_idx").on(table.senderId, table.createdAt)],
);

export const transfer = sqliteTable(
  "transfer",
  {
    id: text("id").$type<TransferId>().primaryKey(),
    deliveryId: text("delivery_id")
      .$type<DeliveryId>()
      .notNull()
      .references(() => delivery.id),
    objectKey: text("object_key").notNull().unique(),
    path: text("path").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type"),
    sourceModifiedAt: integer("source_modified_at", { mode: "timestamp_ms" }).notNull(),
    state: text("state", { enum: ["uploading", "finalizing", "complete", "cancelled"] })
      .default("uploading")
      .notNull(),
    etag: text("etag"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("transfer_deliveryId_idx").on(table.deliveryId),
    uniqueIndex("transfer_deliveryId_path_unique").on(table.deliveryId, table.path),
  ],
);

export const link = sqliteTable(
  "link",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id")
      .$type<DeliveryId>()
      .notNull()
      .references(() => delivery.id),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("link_deliveryId_idx").on(table.deliveryId)],
);

// No row means the Free plan. Webhooks rebuild a row from Polar's customer
// state, so it is a cache of Polar and never the source of truth.
export const subscription = sqliteTable("subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").$type<PlanId>().notNull(),
  status: text("status").$type<SubscriptionStatus>().notNull(),
  polarCustomerId: text("polar_customer_id"),
  polarSubscriptionId: text("polar_subscription_id"),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).default(false).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// A code that gives a paid plan for free, made by hand with `code:create`
// (docs/PRODUCT.md). Stored upper case. The check makes a redemption past
// max_uses fail its batch, so concurrent redemptions can't overshoot.
export const accessCode = sqliteTable(
  "access_code",
  {
    code: text("code").primaryKey(),
    plan: text("plan").$type<PaidPlanId>().notNull(),
    // How long each grant lasts from the moment it is redeemed.
    days: integer("days").notNull(),
    maxUses: integer("max_uses").notNull(),
    uses: integer("uses").default(0).notNull(),
    // Redeemable until then; grants already made keep their own end.
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [check("access_code_uses_within_max", sql`${table.uses} <= ${table.maxUses}`)],
);

// One row per redeemed code. Polar never sees it; the higher of a grant and a
// subscription sets the user's plan.
export const planGrant = sqliteTable(
  "plan_grant",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    code: text("code")
      .notNull()
      .references(() => accessCode.code),
    plan: text("plan").$type<PaidPlanId>().notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.code] })],
);

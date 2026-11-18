import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const premiumKeysTable = sqliteTable(
  "premium_keys",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    durationDays: integer("duration_days").notNull(), // -1 for lifetime
    description: text("description"),
    maxUses: integer("max_uses").default(1).notNull(),
    usedCount: integer("used_count").default(0).notNull(),
    createdBy: text("created_by").notNull().references(() => usersTable.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  },
  (table) => [
    uniqueIndex("premium_keys_key_idx").on(table.key),
  ]
);

export const insertPremiumKeySchema = createInsertSchema(premiumKeysTable).omit({
  id: true,
  createdAt: true,
  usedCount: true,
});

export type InsertPremiumKey = z.infer<typeof insertPremiumKeySchema>;
export type PremiumKey = typeof premiumKeysTable.$inferSelect;

export const adminSettingsTable = sqliteTable(
  "admin_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
    description: text("description"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(new Date()),
    updatedBy: text("updated_by").references(() => usersTable.id),
  }
);

export const insertAdminSettingsSchema = createInsertSchema(adminSettingsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettingsTable.$inferSelect;
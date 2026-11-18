import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";

export const usersTable = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    isEmailVerified: integer("is_email_verified", { mode: "boolean" }).default(false).notNull(),
    isBanned: integer("is_banned", { mode: "boolean" }).default(false).notNull(),
    banReason: text("ban_reason"),
    isAdmin: integer("is_admin", { mode: "boolean" }).default(false).notNull(),
    premiumExpiresAt: integer("premium_expires_at", { mode: "timestamp" }),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(new Date()),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
  ]
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const sessionsTable = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
  ]
);

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
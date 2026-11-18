import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";

export const emailVerificationsTable = sqliteTable(
  "email_verifications",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    code: text("code").notNull(),
    type: text("type", { enum: ["register", "reset_password", "change_email"] }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
  },
  (table) => [
    uniqueIndex("email_verifications_email_type_idx").on(table.email, table.type),
  ]
);

export const insertEmailVerificationSchema = createInsertSchema(emailVerificationsTable).omit({
  id: true,
  createdAt: true,
  attempts: true,
});

export type InsertEmailVerification = z.infer<typeof insertEmailVerificationSchema>;
export type EmailVerification = typeof emailVerificationsTable.$inferSelect;
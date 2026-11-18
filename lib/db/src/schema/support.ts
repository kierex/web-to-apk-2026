import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const supportRequestsTable = sqliteTable(
  "support_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    type: text("type", { enum: ["general", "billing", "technical", "premium", "bug_report", "feature_request"] }).default("general").notNull(),
    status: text("status", { enum: ["open", "in_progress", "resolved", "closed"] }).default("open").notNull(),
    adminResponse: text("admin_response"),
    respondedBy: text("responded_by").references(() => usersTable.id),
    respondedAt: integer("responded_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(new Date()),
  },
  (table) => [
    uniqueIndex("support_requests_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const insertSupportRequestSchema = createInsertSchema(supportRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  respondedAt: true,
});

export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
export type SupportRequest = typeof supportRequestsTable.$inferSelect;
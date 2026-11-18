import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const announcementsTable = sqliteTable(
  "announcements",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type", { enum: ["info", "warning", "success", "error"] }).default("info").notNull(),
    target: text("target", { enum: ["all", "premium", "free"] }).default("all").notNull(),
    isPopup: integer("is_popup", { mode: "boolean" }).default(false).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
    startsAt: integer("starts_at", { mode: "timestamp" }).notNull().default(new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdBy: text("created_by").notNull().references(() => usersTable.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(new Date()),
  },
  (table) => [
    uniqueIndex("announcements_active_idx").on(table.isActive, table.startsAt),
  ]
);

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;

export const announcementReadsTable = sqliteTable(
  "announcement_reads",
  {
    id: text("id").primaryKey(),
    announcementId: text("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp" }).notNull().default(new Date()),
  },
  (table) => [
    uniqueIndex("announcement_reads_unique_idx").on(table.announcementId, table.userId),
  ]
);

export const insertAnnouncementReadSchema = createInsertSchema(announcementReadsTable).omit({
  id: true,
  readAt: true,
});

export type InsertAnnouncementRead = z.infer<typeof insertAnnouncementReadSchema>;
export type AnnouncementRead = typeof announcementReadsTable.$inferSelect;
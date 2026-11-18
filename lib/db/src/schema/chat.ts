import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const chatMessagesTable = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    messageType: text("message_type", { enum: ["text", "image", "system", "announcement"] }).default("text").notNull(),
    imageUrl: text("image_url"),
    replyToId: text("reply_to_id").references((): AnySQLiteColumn => chatMessagesTable.id),
    isDeleted: integer("is_deleted", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(new Date()),
  },
  (table) => [
    uniqueIndex("chat_messages_created_idx").on(table.createdAt),
  ]
);

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;

export const chatSettingsTable = sqliteTable(
  "chat_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
    soundEnabled: integer("sound_enabled", { mode: "boolean" }).default(true).notNull(),
    notificationsEnabled: integer("notifications_enabled", { mode: "boolean" }).default(true).notNull(),
    showTimestamps: integer("show_timestamps", { mode: "boolean" }).default(true).notNull(),
    compactMode: integer("compact_mode", { mode: "boolean" }).default(false).notNull(),
  }
);

export const insertChatSettingsSchema = createInsertSchema(chatSettingsTable).omit({
  id: true,
});

export type InsertChatSettings = z.infer<typeof insertChatSettingsSchema>;
export type ChatSettings = typeof chatSettingsTable.$inferSelect;
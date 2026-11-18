import { createInsertSchema } from "drizzle-zod";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod/v4";

export const apkBuildsTable = sqliteTable(
  "apk_builds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    packageName: text("package_name").notNull(),
    versionName: text("version_name").default("1.0.0").notNull(),
    versionCode: integer("version_code").default(1).notNull(),
    iconDataUrl: text("icon_data_url"),
    sourceType: text("source_type", { enum: ["upload", "url"] }).notNull(),
    sourceUrl: text("source_url"),
    sourceZipPath: text("source_zip_path"),
    status: text("status", { enum: ["queued", "building", "ready", "failed"] }).default("queued").notNull(),
    progress: integer("progress").default(0).notNull(),
    logOutput: text("log_output"),
    apkPath: text("apk_path"),
    apkSize: integer("apk_size"),
    errorMessage: text("error_message"),
    buildDurationMs: integer("build_duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(new Date()),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("apk_builds_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const insertApkBuildSchema = createInsertSchema(apkBuildsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type InsertApkBuild = z.infer<typeof insertApkBuildSchema>;
export type ApkBuild = typeof apkBuildsTable.$inferSelect;

// Import usersTable for reference
import { usersTable } from "./users";
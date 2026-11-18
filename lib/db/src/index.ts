import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use SQLite for Railway (no external DB needed)
// Database file stored in /data volume for persistence
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "../../../data/webz.db");

// Ensure directory exists
import { mkdirSync } from "node:fs";
const dbDir = path.dirname(dbPath);
mkdirSync(dbDir, { recursive: true });

export const sqlite: InstanceType<typeof Database> = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

export * from "./schema";
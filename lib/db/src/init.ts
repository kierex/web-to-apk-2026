import { db, sqlite } from "./index";
import {
  usersTable,
  adminSettingsTable,
  sessionsTable,
  apkBuildsTable,
  premiumKeysTable,
  emailVerificationsTable,
  chatMessagesTable,
  chatSettingsTable,
  announcementsTable,
  announcementReadsTable,
  supportRequestsTable,
} from "./schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

export async function initializeDatabase() {
  console.log("Initializing database...");

  // Create tables using raw SQL for SQLite
  const createTables = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      is_email_verified INTEGER DEFAULT 0 NOT NULL,
      is_banned INTEGER DEFAULT 0 NOT NULL,
      ban_reason TEXT,
      is_admin INTEGER DEFAULT 0 NOT NULL,
      premium_expires_at INTEGER,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,

    // Sessions table
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      user_agent TEXT,
      ip_address TEXT
    )`,

    // APK Builds table
    `CREATE TABLE IF NOT EXISTS apk_builds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      package_name TEXT NOT NULL,
      version_name TEXT DEFAULT '1.0.0' NOT NULL,
      version_code INTEGER DEFAULT 1 NOT NULL,
      icon_data_url TEXT,
      source_type TEXT CHECK(source_type IN ('upload', 'url')) NOT NULL,
      source_url TEXT,
      source_zip_path TEXT,
      status TEXT CHECK(status IN ('queued', 'building', 'ready', 'failed')) DEFAULT 'queued' NOT NULL,
      progress INTEGER DEFAULT 0 NOT NULL,
      log_output TEXT,
      apk_path TEXT,
      apk_size INTEGER,
      error_message TEXT,
      build_duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      completed_at INTEGER
    )`,

    // Premium Keys table
    `CREATE TABLE IF NOT EXISTS premium_keys (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      duration_days INTEGER NOT NULL,
      description TEXT,
      max_uses INTEGER DEFAULT 1 NOT NULL,
      used_count INTEGER DEFAULT 0 NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER,
      is_active INTEGER DEFAULT 1 NOT NULL
    )`,

    // Admin Settings table
    `CREATE TABLE IF NOT EXISTS admin_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_by TEXT REFERENCES users(id)
    )`,

    // Email Verifications table
    `CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT CHECK(type IN ('register', 'reset_password', 'change_email')) NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,

    // Chat Messages table
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      message_type TEXT CHECK(message_type IN ('text', 'image', 'system', 'announcement')) DEFAULT 'text' NOT NULL,
      image_url TEXT,
      reply_to_id TEXT REFERENCES chat_messages(id),
      is_deleted INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,

    // Chat Settings table
    `CREATE TABLE IF NOT EXISTS chat_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      sound_enabled INTEGER DEFAULT 1 NOT NULL,
      notifications_enabled INTEGER DEFAULT 1 NOT NULL,
      show_timestamps INTEGER DEFAULT 1 NOT NULL,
      compact_mode INTEGER DEFAULT 0 NOT NULL
    )`,

    // Announcements table
    `CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT CHECK(type IN ('info', 'warning', 'success', 'error')) DEFAULT 'info' NOT NULL,
      target TEXT CHECK(target IN ('all', 'premium', 'free')) DEFAULT 'all' NOT NULL,
      is_popup INTEGER DEFAULT 0 NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      starts_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,

    // Announcement Reads table
    `CREATE TABLE IF NOT EXISTS announcement_reads (
      id TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(announcement_id, user_id)
    )`,

    // Support Requests table
    `CREATE TABLE IF NOT EXISTS support_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT CHECK(type IN ('general', 'billing', 'technical', 'premium', 'bug_report', 'feature_request')) DEFAULT 'general' NOT NULL,
      status TEXT CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')) DEFAULT 'open' NOT NULL,
      admin_response TEXT,
      responded_by TEXT REFERENCES users(id),
      responded_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_apk_builds_user_created ON apk_builds(user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_premium_keys_key ON premium_keys(key)`,
    `CREATE INDEX IF NOT EXISTS idx_email_verifications_email_type ON email_verifications(email, type)`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, starts_at)`,
    `CREATE INDEX IF NOT EXISTS idx_support_requests_user_created ON support_requests(user_id, created_at)`,
  ];

  for (const sql of createTables) {
    sqlite.exec(sql);
  }

  console.log("Tables created successfully");

  // Seed default admin user if not exists
  await seedDefaultAdmin();

  // Seed default admin settings
  await seedDefaultSettings();

  console.log("Database initialization complete");
}

async function seedDefaultAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@webz.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const adminName = process.env.ADMIN_NAME || "Webz Admin";

  const existingAdmin = sqlite
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(adminEmail);

  if (!existingAdmin) {
    const passwordHash = await hashPassword(adminPassword);
    const adminId = crypto.randomUUID();

    sqlite
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, is_email_verified, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 1, strftime('%s', 'now'), strftime('%s', 'now'))`
      )
      .run(adminId, adminEmail, passwordHash, adminName);

    console.log(`Default admin created: ${adminEmail} / ${adminPassword}`);
    console.log("IMPORTANT: Change these credentials in the admin dashboard after first login!");
  } else {
    console.log("Admin user already exists");
  }
}

async function seedDefaultSettings() {
  const defaultSettings = [
    { key: "smtp_host", value: "", description: "SMTP server host (e.g., smtp.gmail.com)" },
    { key: "smtp_port", value: "587", description: "SMTP server port" },
    { key: "smtp_user", value: "", description: "SMTP username" },
    { key: "smtp_pass", value: "", description: "SMTP password/app password" },
    { key: "smtp_from", value: "Webz <noreply@webz.local>", description: "From email address" },
    { key: "app_name", value: "Webz HTML to APK", description: "Application name" },
    { key: "app_url", value: "http://localhost:5000", description: "Application base URL" },
    { key: "free_daily_builds", value: "3", description: "Free tier daily build limit" },
    { key: "free_max_file_size_mb", value: "50", description: "Free tier max file size in MB" },
    { key: "premium_daily_builds", value: "999", description: "Premium tier daily build limit" },
    { key: "premium_max_file_size_mb", value: "500", description: "Premium tier max file size in MB" },
    { key: "maintenance_mode", value: "false", description: "Enable maintenance mode" },
    { key: "registration_enabled", value: "true", description: "Allow new user registration" },
    { key: "email_verification_required", value: "true", description: "Require email verification for registration" },
    { key: "contact_developer_url", value: "https://www.facebook.com/profile.php?id=61594727052834", description: "Contact developer URL for premium purchase" },
  ];

  for (const setting of defaultSettings) {
    const exists = sqlite.prepare("SELECT id FROM admin_settings WHERE key = ?").get(setting.key);
    if (!exists) {
      sqlite
        .prepare("INSERT INTO admin_settings (key, value, description) VALUES (?, ?, ?)")
        .run(setting.key, setting.value, setting.description);
    }
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return hash === computedHash;
}
import { sqlite } from "@workspace/db";
import { adminSettingsTable } from "@workspace/db/schema";

interface AppConfig {
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  };
  app: {
    name: string;
    url: string;
  };
  limits: {
    freeDailyBuilds: number;
    freeMaxFileSizeMb: number;
    premiumDailyBuilds: number;
    premiumMaxFileSizeMb: number;
  };
  features: {
    maintenanceMode: boolean;
    registrationEnabled: boolean;
    emailVerificationRequired: boolean;
  };
  contactDeveloperUrl: string;
}

let configCache: AppConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

function getSetting(key: string, defaultValue: string): string {
  const row = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}

export function getConfig(): AppConfig {
  const now = Date.now();
  if (configCache && now - cacheTimestamp < CACHE_TTL) {
    return configCache;
  }

  configCache = {
    smtp: {
      host: getSetting("smtp_host", process.env.SMTP_HOST || "smtp.gmail.com"),
      port: parseInt(getSetting("smtp_port", process.env.SMTP_PORT || "587"), 10),
      user: getSetting("smtp_user", process.env.SMTP_USER || ""),
      pass: getSetting("smtp_pass", process.env.SMTP_PASS || ""),
      from: getSetting("smtp_from", process.env.SMTP_FROM || "Webz <noreply@webz.local>"),
    },
    app: {
      name: getSetting("app_name", process.env.APP_NAME || "Webz HTML to APK"),
      url: getSetting("app_url", process.env.APP_URL || "http://localhost:5000"),
    },
    limits: {
      freeDailyBuilds: parseInt(getSetting("free_daily_builds", process.env.FREE_DAILY_BUILDS || "3"), 10),
      freeMaxFileSizeMb: parseInt(getSetting("free_max_file_size_mb", process.env.FREE_MAX_FILE_SIZE_MB || "50"), 10),
      premiumDailyBuilds: parseInt(getSetting("premium_daily_builds", process.env.PREMIUM_DAILY_BUILDS || "999"), 10),
      premiumMaxFileSizeMb: parseInt(getSetting("premium_max_file_size_mb", process.env.PREMIUM_MAX_FILE_SIZE_MB || "500"), 10),
    },
    features: {
      maintenanceMode: getSetting("maintenance_mode", process.env.MAINTENANCE_MODE || "false") === "true",
      registrationEnabled: getSetting("registration_enabled", process.env.REGISTRATION_ENABLED || "true") === "true",
      emailVerificationRequired: getSetting("email_verification_required", process.env.EMAIL_VERIFICATION_REQUIRED || "true") === "true",
    },
    contactDeveloperUrl: getSetting("contact_developer_url", process.env.CONTACT_DEVELOPER_URL || "https://www.facebook.com/profile.php?id=61594727052834"),
  };

  cacheTimestamp = now;
  return configCache;
}

export function invalidateConfigCache() {
  configCache = null;
  cacheTimestamp = 0;
}

export function isSmtpConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

export function updateSetting(key: string, value: string, updatedBy?: string) {
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO admin_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .run(key, value, now, updatedBy || null);
  invalidateConfigCache();
}

export function getAllSettings() {
  return sqlite.prepare("SELECT * FROM admin_settings").all() as Array<{
    id: number;
    key: string;
    value: string;
    description: string | null;
    updated_at: number;
    updated_by: string | null;
  }>;
}
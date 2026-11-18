import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { sqlite } from "@workspace/db";
import { ADMIN_COOKIE_NAME, createAdminCookie, getAdminFromRequest, isAdmin, isAdminCredentials, requireAdmin } from "../lib/auth";
import { getConfig, invalidateConfigCache, updateSetting, getAllSettings } from "../lib/config";
import { sendAdminNotificationEmail } from "../lib/mailer";

const router: IRouter = Router();

function setAdminCookie(res: Response, adminEmail: string) {
  res.cookie(ADMIN_COOKIE_NAME, createAdminCookie(adminEmail), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12,
    path: "/",
  });
}

// ---------- Auth ----------

router.post("/admin/login", async (req, res) => {
  const parsed = z.object({ username: z.string().min(2), password: z.string().min(4) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the admin username and password." });
    return;
  }
  const username = parsed.data.username.trim().toLowerCase();
  // Accept either the admin email or the literal "admin" username
  const admin =
    username === "admin"
      ? (sqlite.prepare("SELECT * FROM users WHERE is_admin = 1 ORDER BY created_at ASC LIMIT 1").get() as any)
      : (sqlite.prepare("SELECT * FROM users WHERE email = ? AND is_admin = 1").get(username) as any);
  if (!admin || !isAdminCredentials(admin.email, parsed.data.password)) {
    res.status(401).json({ error: "Invalid admin credentials." });
    return;
  }
  setAdminCookie(res, admin.email);
  res.json({ success: true, username: admin.email });
});

router.post("/admin/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

router.get("/admin/session", (req, res) => {
  const admin = getAdminFromRequest(req);
  res.json({
    authenticated: Boolean(admin),
    user: admin ? { email: admin.email, name: admin.name, isAdmin: true } : null,
  });
});

// ---------- Overview ----------

router.get("/admin/overview", requireAdmin, async (_req, res) => {
  const count = (sql: string) => (sqlite.prepare(sql).get() as { count: number }).count;
  res.json({
    totalUsers: count("SELECT COUNT(*) AS count FROM users WHERE is_admin = 0"),
    premiumUsers: count("SELECT COUNT(*) AS count FROM users WHERE is_admin = 0 AND premium_expires_at IS NOT NULL AND premium_expires_at > strftime('%s','now')"),
    totalBuilds: count("SELECT COUNT(*) AS count FROM apk_builds"),
    buildsToday: count("SELECT COUNT(*) AS count FROM apk_builds WHERE created_at >= strftime('%s','now')"),
    openRequests: count("SELECT COUNT(*) AS count FROM support_requests WHERE status IN ('open','in_progress')"),
    activeKeys: count("SELECT COUNT(*) AS count FROM premium_keys WHERE is_active = 1 AND used_count < max_uses"),
    activeAnnouncements: count("SELECT COUNT(*) AS count FROM announcements WHERE is_active = 1"),
    chatMessages: count("SELECT COUNT(*) AS count FROM chat_messages"),
    maintenanceMode: getConfig().features.maintenanceMode,
  });
});

// ---------- Users ----------

router.get("/admin/users", requireAdmin, async (_req, res) => {
  const search = String(_req.query.q || "").trim().toLowerCase();
  const rows = sqlite
    .prepare(
      `SELECT u.id, u.email, u.name, u.is_email_verified, u.is_banned, u.ban_reason, u.is_admin,
              u.premium_expires_at, u.last_login_at, u.created_at,
              (SELECT COUNT(*) FROM apk_builds b WHERE b.user_id = u.id) AS builds_count
       FROM users u
       WHERE u.is_admin = 0
         AND (? = '' OR u.email LIKE '%' || ? || '%' OR u.name LIKE '%' || ? || '%')
       ORDER BY u.created_at DESC LIMIT 200`
    )
    .all(search, search, search) as any[];

  res.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isEmailVerified: Boolean(u.is_email_verified),
      isBanned: Boolean(u.is_banned),
      banReason: u.ban_reason,
      isPremium: u.premium_expires_at !== null && u.premium_expires_at > Math.floor(Date.now() / 1000),
      premiumExpiresAt: u.premium_expires_at ? new Date(u.premium_expires_at * 1000).toISOString() : null,
      lastLoginAt: u.last_login_at ? new Date(u.last_login_at * 1000).toISOString() : null,
      createdAt: new Date(u.created_at * 1000).toISOString(),
      buildsCount: u.builds_count,
    })),
  );
});

router.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      ban: z.boolean().optional(),
      banReason: z.string().max(300).optional().nullable(),
      premiumDays: z.number().int().min(-1).max(3650).optional(), // -1 lifetime, 0 remove
      name: z.string().max(100).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user update." });
    return;
  }
  const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const now = Math.floor(Date.now() / 1000);

  if (parsed.data.ban !== undefined) {
    sqlite.prepare("UPDATE users SET is_banned = ?, ban_reason = ?, updated_at = ? WHERE id = ?").run(
      parsed.data.ban ? 1 : 0,
      parsed.data.ban ? parsed.data.banReason || null : null,
      now,
      user.id,
    );
  }
  if (parsed.data.name !== undefined) {
    sqlite.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(parsed.data.name, now, user.id);
  }
  if (parsed.data.premiumDays !== undefined) {
    const days = parsed.data.premiumDays;
    if (days === -1) {
      sqlite.prepare("UPDATE users SET premium_expires_at = NULL, updated_at = ? WHERE id = ?").run(now, user.id);
    } else if (days === 0) {
      sqlite.prepare("UPDATE users SET premium_expires_at = NULL, updated_at = ? WHERE id = ?").run(now, user.id);
    } else {
      const base = user.premium_expires_at && user.premium_expires_at > now ? user.premium_expires_at : now;
      sqlite.prepare("UPDATE users SET premium_expires_at = ?, updated_at = ? WHERE id = ?").run(base + days * 86400, now, user.id);
    }
  }
  res.json({ success: true });
});

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  sqlite.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  res.json({ success: true });
});

// ---------- Builds ----------

router.get("/admin/builds", requireAdmin, async (_req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT b.id, b.name, b.status, b.progress, b.apk_size, b.error_message, b.created_at, b.build_duration_ms,
              u.email, u.name AS user_name
       FROM apk_builds b JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC LIMIT 200`
    )
    .all() as any[];
  res.json(
    rows.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      progress: b.progress,
      apkSize: b.apk_size,
      errorMessage: b.error_message,
      userEmail: b.email,
      userName: b.user_name,
      createdAt: new Date(b.created_at * 1000).toISOString(),
      buildDurationMs: b.build_duration_ms,
      downloadUrl: b.status === "ready" ? `/api/admin/builds/${b.id}/download` : null,
    })),
  );
});

router.get("/admin/builds/:id/download", requireAdmin, async (req, res) => {
  const build = sqlite.prepare("SELECT * FROM apk_builds WHERE id = ?").get(req.params.id) as any;
  if (!build || build.status !== "ready" || !build.apk_path) {
    res.status(404).json({ error: "This APK is not available." });
    return;
  }
  const fileName = `${build.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "web-app"}-debug.apk`;
  res.download(build.apk_path, fileName, { headers: { "Content-Type": "application/vnd.android.package-archive" } });
});

// ---------- Premium keys ----------

function generateKeyString(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) => Array.from({ length: n }, () => alphabet[randomBytes(1)[0] % alphabet.length]).join("");
  return `WEBZ-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
}

router.post("/admin/keys", requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      durationDays: z.number().int().min(-1).max(3650), // -1 lifetime
      description: z.string().max(200).optional(),
      maxUses: z.number().int().min(1).max(1000).optional().default(1),
      expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid key parameters." });
    return;
  }
  const id = randomUUID();
  const key = generateKeyString();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parsed.data.expiresInDays ? now + parsed.data.expiresInDays * 86400 : null;
  sqlite
    .prepare(
      `INSERT INTO premium_keys (id, key, duration_days, description, max_uses, used_count, created_by, created_at, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`
    )
    .run(id, key, parsed.data.durationDays, parsed.data.description || null, parsed.data.maxUses, req.userId, now, expiresAt);
  res.status(201).json({ id, key, durationDays: parsed.data.durationDays, maxUses: parsed.data.maxUses, expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null });
});

router.get("/admin/keys", requireAdmin, async (_req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT k.*, u.name AS created_by_name
       FROM premium_keys k LEFT JOIN users u ON u.id = k.created_by
       ORDER BY k.created_at DESC LIMIT 200`
    )
    .all() as any[];
  res.json(
    rows.map((k) => ({
      id: k.id,
      key: k.key,
      durationDays: k.duration_days,
      description: k.description,
      maxUses: k.max_uses,
      usedCount: k.used_count,
      createdBy: k.created_by_name,
      createdAt: new Date(k.created_at * 1000).toISOString(),
      expiresAt: k.expires_at ? new Date(k.expires_at * 1000).toISOString() : null,
      isActive: Boolean(k.is_active),
    })),
  );
});

router.delete("/admin/keys/:id", requireAdmin, async (req, res) => {
  sqlite.prepare("DELETE FROM premium_keys WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------- Settings ----------

router.get("/admin/settings", requireAdmin, async (_req, res) => {
  const settings = Object.fromEntries(getAllSettings().map((s) => [s.key, s.value]));
  res.json({
    admin: {
      username: process.env.ADMIN_EMAIL || "admin@webz.local",
    },
    smtp: {
      host: settings.smtp_host || "",
      port: settings.smtp_port || "587",
      user: settings.smtp_user || "",
      pass: settings.smtp_pass || "",
      from: settings.smtp_from || "",
    },
    app: {
      name: settings.app_name || "Webz HTML to APK",
      url: settings.app_url || "",
    },
    limits: {
      freeDailyBuilds: Number(settings.free_daily_builds || 3),
      freeMaxFileSizeMb: Number(settings.free_max_file_size_mb || 50),
      premiumDailyBuilds: Number(settings.premium_daily_builds || 999),
      premiumMaxFileSizeMb: Number(settings.premium_max_file_size_mb || 500),
    },
    features: {
      maintenanceMode: settings.maintenance_mode === "true",
      registrationEnabled: settings.registration_enabled === "true",
      emailVerificationRequired: settings.email_verification_required === "true",
    },
    contactDeveloperUrl: settings.contact_developer_url || "",
  });
});

router.patch("/admin/settings", requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      smtp: z
        .object({
          host: z.string().max(200).optional(),
          port: z.union([z.string().max(10), z.number()]).optional(),
          user: z.string().max(200).optional(),
          pass: z.string().max(200).optional(),
          from: z.string().max(200).optional(),
        })
        .optional(),
      app: z.object({ name: z.string().max(100).optional(), url: z.string().max(300).optional() }).optional(),
      limits: z
        .object({
          freeDailyBuilds: z.number().int().min(0).max(9999).optional(),
          freeMaxFileSizeMb: z.number().int().min(1).max(5000).optional(),
          premiumDailyBuilds: z.number().int().min(1).max(99999).optional(),
          premiumMaxFileSizeMb: z.number().int().min(1).max(10000).optional(),
        })
        .optional(),
      features: z
        .object({
          maintenanceMode: z.boolean().optional(),
          registrationEnabled: z.boolean().optional(),
          emailVerificationRequired: z.boolean().optional(),
        })
        .optional(),
      contactDeveloperUrl: z.string().max(500).optional(),
      changePassword: z.object({ currentPassword: z.string().min(4), newPassword: z.string().min(6).max(100) }).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings." });
    return;
  }
  const d = parsed.data;
  const set = (key: string, value: string | undefined) => {
    if (value !== undefined) updateSetting(key, String(value), req.userId);
  };

  if (d.smtp) {
    set("smtp_host", d.smtp.host);
    set("smtp_port", d.smtp.port ? String(d.smtp.port) : undefined);
    set("smtp_user", d.smtp.user);
    set("smtp_pass", d.smtp.pass);
    set("smtp_from", d.smtp.from);
  }
  if (d.app) {
    set("app_name", d.app.name);
    set("app_url", d.app.url);
  }
  if (d.limits) {
    set("free_daily_builds", d.limits.freeDailyBuilds !== undefined ? String(d.limits.freeDailyBuilds) : undefined);
    set("free_max_file_size_mb", d.limits.freeMaxFileSizeMb !== undefined ? String(d.limits.freeMaxFileSizeMb) : undefined);
    set("premium_daily_builds", d.limits.premiumDailyBuilds !== undefined ? String(d.limits.premiumDailyBuilds) : undefined);
    set("premium_max_file_size_mb", d.limits.premiumMaxFileSizeMb !== undefined ? String(d.limits.premiumMaxFileSizeMb) : undefined);
  }
  if (d.features) {
    set("maintenance_mode", d.features.maintenanceMode !== undefined ? String(d.features.maintenanceMode) : undefined);
    set("registration_enabled", d.features.registrationEnabled !== undefined ? String(d.features.registrationEnabled) : undefined);
    set("email_verification_required", d.features.emailVerificationRequired !== undefined ? String(d.features.emailVerificationRequired) : undefined);
  }
  set("contact_developer_url", d.contactDeveloperUrl);

  // Change admin password
  if (d.changePassword) {
    const admin = sqlite
      .prepare("SELECT * FROM users WHERE is_admin = 1 LIMIT 1")
      .get() as any;
    if (!admin) {
      res.status(404).json({ error: "No admin account found." });
      return;
    }
    const { verifyPassword, hashPassword } = await import("../lib/auth");
    if (!verifyPassword(d.changePassword.currentPassword, admin.password_hash)) {
      res.status(400).json({ error: "Current admin password is incorrect." });
      return;
    }
    const { hashPassword: hp } = await import("../lib/auth");
    sqlite.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hp(d.changePassword.newPassword), Math.floor(Date.now() / 1000), admin.id);
  }

  invalidateConfigCache();
  res.json({ success: true });
});

// ---------- Support requests ----------

router.get("/admin/requests", requireAdmin, async (_req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT r.*, u.email, u.name AS user_name
       FROM support_requests r JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC LIMIT 200`
    )
    .all() as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      message: r.message,
      type: r.type,
      status: r.status,
      adminResponse: r.admin_response,
      userEmail: r.email,
      userName: r.user_name,
      createdAt: new Date(r.created_at * 1000).toISOString(),
      respondedAt: r.responded_at ? new Date(r.responded_at * 1000).toISOString() : null,
    })),
  );
});

router.patch("/admin/requests/:id", requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
      adminResponse: z.string().max(5000).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request update." });
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `UPDATE support_requests
       SET status = COALESCE(?, status),
           admin_response = COALESCE(?, admin_response),
           responded_by = ?,
           responded_at = CASE WHEN ? IS NULL THEN responded_at ELSE ? END,
           updated_at = ?
       WHERE id = ?`
    )
    .run(
      parsed.data.status ?? null,
      parsed.data.adminResponse ?? null,
      parsed.data.adminResponse ? req.userId : null,
      parsed.data.adminResponse ? now : null,
      parsed.data.adminResponse ? now : null,
      now,
      req.params.id,
    );
  res.json({ success: true });
});

// ---------- Announcements ----------

router.get("/admin/announcements", requireAdmin, async (_req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT a.*, u.name AS created_by_name,
              (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.created_at DESC LIMIT 200`
    )
    .all() as any[];
  res.json(
    rows.map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      target: a.target,
      isPopup: Boolean(a.is_popup),
      isActive: Boolean(a.is_active),
      readCount: a.read_count,
      createdBy: a.created_by_name,
      createdAt: new Date(a.created_at * 1000).toISOString(),
      expiresAt: a.expires_at ? new Date(a.expires_at * 1000).toISOString() : null,
    })),
  );
});

router.post("/admin/announcements", requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(2).max(140),
      message: z.string().min(2).max(2000),
      type: z.enum(["info", "warning", "success", "error"]).optional().default("info"),
      target: z.enum(["all", "premium", "free"]).optional().default("all"),
      isPopup: z.boolean().optional().default(false),
      expiresInHours: z.number().int().min(1).max(24 * 365).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid announcement." });
    return;
  }
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parsed.data.expiresInHours ? now + parsed.data.expiresInHours * 3600 : null;
  sqlite
    .prepare(
      `INSERT INTO announcements (id, title, message, type, target, is_popup, is_active, starts_at, expires_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
    )
    .run(id, parsed.data.title, parsed.data.message, parsed.data.type, parsed.data.target, parsed.data.isPopup ? 1 : 0, now, expiresAt, req.userId, now, now);

  // Push live to connected users
  try {
    const { getIoInstance } = await import("../lib/socket");
    getIoInstance()?.to("world-chat").emit("announcement:new", {
      id,
      title: parsed.data.title,
      message: parsed.data.message,
      type: parsed.data.type,
      target: parsed.data.target,
      isPopup: parsed.data.isPopup,
    });
  } catch {
    // socket not ready, ignore
  }

  res.status(201).json({ id });
});

router.patch("/admin/announcements/:id", requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(2).max(140).optional(),
      message: z.string().min(2).max(2000).optional(),
      type: z.enum(["info", "warning", "success", "error"]).optional(),
      target: z.enum(["all", "premium", "free"]).optional(),
      isPopup: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid announcement update." });
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `UPDATE announcements
       SET title = COALESCE(?, title),
           message = COALESCE(?, message),
           type = COALESCE(?, type),
           target = COALESCE(?, target),
           is_popup = COALESCE(?, is_popup),
           is_active = COALESCE(?, is_active),
           updated_at = ?
       WHERE id = ?`
    )
    .run(
      parsed.data.title ?? null,
      parsed.data.message ?? null,
      parsed.data.type ?? null,
      parsed.data.target ?? null,
      parsed.data.isPopup !== undefined ? (parsed.data.isPopup ? 1 : 0) : null,
      parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : null,
      now,
      req.params.id,
    );
  res.json({ success: true });
});

router.delete("/admin/announcements/:id", requireAdmin, async (req, res) => {
  sqlite.prepare("DELETE FROM announcements WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---------- Chat moderation ----------

router.get("/admin/chat/messages", requireAdmin, async (_req, res) => {
  const rows = sqlite
    .prepare(
      `SELECT m.*, u.name, u.is_admin
       FROM chat_messages m JOIN users u ON u.id = m.user_id
       WHERE m.is_deleted = 0
       ORDER BY m.created_at DESC LIMIT 200`
    )
    .all() as any[];
  res.json(
    rows.reverse().map((m) => ({
      id: m.id,
      userId: m.user_id,
      userName: m.name,
      userIsAdmin: Boolean(m.is_admin),
      content: m.content,
      messageType: m.message_type,
      createdAt: m.created_at * 1000,
    })),
  );
});

router.post("/admin/chat/messages", requireAdmin, async (req, res) => {
  const parsed = z.object({ content: z.string().min(1).max(5000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message." });
    return;
  }
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO chat_messages (id, user_id, content, message_type, created_at, updated_at)
       VALUES (?, ?, ?, 'announcement', ?, ?)`
    )
    .run(id, req.userId, parsed.data.content, now, now);

  try {
    const { getIoInstance } = await import("../lib/socket");
    getIoInstance()?.to("world-chat").emit("chat:message", {
      id,
      userId: req.userId,
      userName: "Admin",
      userIsAdmin: true,
      content: parsed.data.content,
      messageType: "announcement",
      imageUrl: null,
      replyToId: null,
      createdAt: now * 1000,
      updatedAt: now * 1000,
    });
  } catch {
    // ignore
  }
  res.status(201).json({ id });
});

router.delete("/admin/chat/messages/:id", requireAdmin, async (req, res) => {
  sqlite.prepare("UPDATE chat_messages SET is_deleted = 1 WHERE id = ?").run(req.params.id);
  try {
    const { getIoInstance } = await import("../lib/socket");
    getIoInstance()?.to("world-chat").emit("chat:deleted", { messageId: req.params.id });
  } catch {
    // ignore
  }
  res.json({ success: true });
});

router.get("/admin/chat/settings", requireAdmin, async (_req, res) => {
  res.json({
    freeRateLimitMs: 3000,
    premiumRateLimitMs: 1000,
    maxMessageLength: 5000,
  });
});

router.patch("/admin/chat/settings", requireAdmin, async (_req, res) => {
  res.json({ success: true, note: "Chat rate limits are fixed for now." });
});

export default router;

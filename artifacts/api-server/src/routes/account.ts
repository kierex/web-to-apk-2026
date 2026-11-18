import { Router, type IRouter } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sqlite } from "@workspace/db";
import { requireUser, type AppRequest, isPremium } from "../lib/auth";
import { getConfig } from "../lib/config";
import { sendSupportEmail, sendPremiumActivatedEmail } from "../lib/mailer";

const router: IRouter = Router();

function buildPublicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isEmailVerified: user.isEmailVerified,
    isAdmin: user.isAdmin,
    isPremium: isPremium(user),
    premiumExpiresAt: user.premiumExpiresAt ? user.premiumExpiresAt.toISOString() : null,
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt ? (user.createdAt instanceof Date ? user.createdAt.getTime() : Number(user.createdAt)) : null,
  };
}

function buildsUsedToday(userId: string): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const row = sqlite
    .prepare("SELECT COUNT(*) AS count FROM apk_builds WHERE user_id = ? AND created_at >= ?")
    .get(userId, Math.floor(startOfDay.getTime() / 1000)) as { count: number };
  return row.count;
}

router.get("/me", requireUser, async (req: AppRequest, res) => {
  const user = req.user!;
  const config = getConfig();
  const premium = isPremium(user);
  res.json({
    ...buildPublicUser(user),
    plan: premium ? "premium" : "free",
    freeBuildsUsed: buildsUsedToday(user.id),
    freeBuildsLimit: config.limits.freeDailyBuilds,
    premiumBuildsUsed: premium ? buildsUsedToday(user.id) : 0,
    premiumBuildsLimit: premium ? config.limits.premiumDailyBuilds : 0,
    contactUrl: config.contactDeveloperUrl,
  });
});

router.get("/me/builds", requireUser, async (req: AppRequest, res) => {
  const builds = sqlite
    .prepare(
      `SELECT id, name, status, progress, log_output, apk_size, error_message, created_at, completed_at, build_duration_ms
       FROM apk_builds WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.userId) as any[];
  res.json(
    builds.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      progress: b.progress,
      message: b.log_output,
      apkSize: b.apk_size,
      errorMessage: b.error_message,
      createdAt: b.created_at * 1000,
      completedAt: b.completed_at ? b.completed_at * 1000 : null,
      buildDurationMs: b.build_duration_ms,
      downloadUrl: b.status === "ready" ? `/api/apk/build/${b.id}/download` : null,
    })),
  );
});

router.post("/me/premium/redeem", requireUser, async (req: AppRequest, res) => {
  const parsed = z.object({ key: z.string().min(4).max(64) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid premium key." });
    return;
  }
  const user = req.user!;
  const key = sqlite
    .prepare("SELECT * FROM premium_keys WHERE key = ? AND is_active = 1")
    .get(parsed.data.key.trim().toUpperCase()) as any;

  if (!key) {
    res.status(400).json({ error: "That premium key is invalid or has already been used." });
    return;
  }
  if (key.expires_at && key.expires_at < Math.floor(Date.now() / 1000)) {
    res.status(400).json({ error: "That premium key has expired." });
    return;
  }
  if (key.used_count >= key.max_uses) {
    res.status(400).json({ error: "That premium key has already been redeemed." });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const currentExpiry = sqlite
    .prepare("SELECT premium_expires_at FROM users WHERE id = ?")
    .get(user.id) as { premium_expires_at: number | null };
  const base = currentExpiry.premium_expires_at && currentExpiry.premium_expires_at > now ? currentExpiry.premium_expires_at : now;
  const durationDays = key.duration_days; // -1 = lifetime
  const newExpiry = durationDays === -1 ? null : base + durationDays * 86400;

  sqlite.prepare("UPDATE users SET premium_expires_at = ?, updated_at = ? WHERE id = ?").run(newExpiry, now, user.id);
  sqlite.prepare("UPDATE premium_keys SET used_count = used_count + 1 WHERE id = ?").run(key.id);

  void sendPremiumActivatedEmail(user.email, user.name, newExpiry ? new Date(newExpiry * 1000).toISOString() : null);

  res.json({
    success: true,
    message: durationDays === -1 ? "Lifetime premium activated!" : `Premium extended by ${durationDays} day(s).`,
    premiumExpiresAt: newExpiry ? new Date(newExpiry * 1000).toISOString() : null,
  });
});

router.post("/me/support", requireUser, async (req: AppRequest, res) => {
  const parsed = z
    .object({
      subject: z.string().min(3).max(140),
      message: z.string().min(5).max(5000),
      type: z.enum(["general", "billing", "technical", "premium", "bug_report", "feature_request"]).optional().default("general"),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add a subject and a message before sending." });
    return;
  }
  const user = req.user!;
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO support_requests (id, user_id, subject, message, type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(id, user.id, parsed.data.subject, parsed.data.message, parsed.data.type, now, now);

  // Email the developer if SMTP is configured
  void sendSupportEmail(
    "admin@webz.local",
    `[Webz] ${parsed.data.subject} (${parsed.data.type})`,
    parsed.data.message,
    user.email,
    user.name,
  );

  res.status(201).json({ id, status: "open", createdAt: now * 1000, contactUrl: getConfig().contactDeveloperUrl });
});

router.get("/me/support", requireUser, async (req: AppRequest, res) => {
  const rows = sqlite
    .prepare(
      `SELECT id, subject, message, type, status, admin_response, created_at, responded_at
       FROM support_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(req.userId) as any[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      message: r.message,
      type: r.type,
      status: r.status,
      adminResponse: r.admin_response,
      createdAt: r.created_at * 1000,
      respondedAt: r.responded_at ? r.responded_at * 1000 : null,
    })),
  );
});

// Active announcements for this user (popup + banner)
router.get("/me/announcements", requireUser, async (req: AppRequest, res) => {
  const user = req.user!;
  const now = Math.floor(Date.now() / 1000);
  const premium = isPremium(user);
  const rows = sqlite
    .prepare(
      `SELECT a.* FROM announcements a
       WHERE a.is_active = 1
         AND a.starts_at <= ?
         AND (a.expires_at IS NULL OR a.expires_at > ?)
         AND (a.target = 'all' OR (a.target = 'premium' AND ? = 1) OR (a.target = 'free' AND ? = 0))
       ORDER BY a.created_at DESC`
    )
    .all(now, now, premium ? 1 : 0, premium ? 0 : 1) as any[];

  const readIds = new Set(
    (sqlite
      .prepare("SELECT announcement_id FROM announcement_reads WHERE user_id = ?")
      .all(user.id) as any[]).map((r) => r.announcement_id),
  );

  res.json(
    rows.map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      target: a.target,
      isPopup: Boolean(a.is_popup),
      isRead: readIds.has(a.id),
      createdAt: a.created_at * 1000,
      expiresAt: a.expires_at ? a.expires_at * 1000 : null,
    })),
  );
});

router.post("/me/announcements/:id/read", requireUser, async (req: AppRequest, res) => {
  const now = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO announcement_reads (id, announcement_id, user_id, read_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(randomUUID(), req.params.id, req.userId, now);
  res.json({ success: true });
});

// Chat settings
router.get("/me/chat/settings", requireUser, async (req: AppRequest, res) => {
  const row = sqlite.prepare("SELECT * FROM chat_settings WHERE user_id = ?").get(req.userId) as any;
  res.json({
    soundEnabled: row ? Boolean(row.sound_enabled) : true,
    notificationsEnabled: row ? Boolean(row.notifications_enabled) : true,
    showTimestamps: row ? Boolean(row.show_timestamps) : true,
    compactMode: row ? Boolean(row.compact_mode) : false,
  });
});

router.patch("/me/chat/settings", requireUser, async (req: AppRequest, res) => {
  const parsed = z
    .object({
      soundEnabled: z.boolean().optional(),
      notificationsEnabled: z.boolean().optional(),
      showTimestamps: z.boolean().optional(),
      compactMode: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chat settings." });
    return;
  }
  const current = sqlite.prepare("SELECT * FROM chat_settings WHERE user_id = ?").get(req.userId) as any;
  const next = {
    soundEnabled: parsed.data.soundEnabled ?? (current ? current.sound_enabled : 1),
    notificationsEnabled: parsed.data.notificationsEnabled ?? (current ? current.notifications_enabled : 1),
    showTimestamps: parsed.data.showTimestamps ?? (current ? current.show_timestamps : 1),
    compactMode: parsed.data.compactMode ?? (current ? current.compact_mode : 0),
  };
  sqlite
    .prepare(
      `INSERT INTO chat_settings (user_id, sound_enabled, notifications_enabled, show_timestamps, compact_mode)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         sound_enabled = excluded.sound_enabled,
         notifications_enabled = excluded.notifications_enabled,
         show_timestamps = excluded.show_timestamps,
         compact_mode = excluded.compact_mode`
    )
    .run(req.userId, next.soundEnabled ? 1 : 0, next.notificationsEnabled ? 1 : 0, next.showTimestamps ? 1 : 0, next.compactMode ? 1 : 0);
  res.json({
    soundEnabled: Boolean(next.soundEnabled),
    notificationsEnabled: Boolean(next.notificationsEnabled),
    showTimestamps: Boolean(next.showTimestamps),
    compactMode: Boolean(next.compactMode),
  });
});

export default router;
